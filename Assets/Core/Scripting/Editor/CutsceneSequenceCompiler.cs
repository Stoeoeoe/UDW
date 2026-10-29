using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using MoonSharp.Interpreter;

namespace Core.Scripting.Editor
{
    /// <summary>Emits one Lua call per authored step; the definition retains the steps for diagnostics.</summary>
    internal static class CutsceneSequenceCompiler
    {
        public static string Compile(JArray sequence, string source) => Compile(sequence, source, out _);

        public static string Compile(JArray sequence, string source, out CutsceneStep[] steps,
            string phase = "sequence", ISet<string> usedIds = null, bool path = false, bool trackSteps = false,
            IReadOnlyList<CutsceneVariableDefinition> variables = null)
        {
            if (sequence == null) throw new ArgumentNullException(nameof(sequence));
            if (string.IsNullOrWhiteSpace(source)) throw new ArgumentException("Source identity is required.", nameof(source));
            var section = phase switch { "setup" => "onStart", "sequence" => "sequence", "completion" => "onComplete.steps",
                _ => throw new ArgumentException("Unknown cutscene phase.", nameof(phase)) };
            if (phase == "sequence" && !path && sequence.Count == 0) throw Invalid(source, "The sequence needs at least one step.");
            var imported = new List<CutsceneStep>();
            var locals = new CutsceneVariables(variables ?? Array.Empty<CutsceneVariableDefinition>());
            trackSteps |= sequence.OfType<JObject>().Any(step => (string)step["action"] is "control.if" or "control.parallel");
            trackSteps |= sequence.OfType<JObject>().Any(step => (string)step["action"] == "cutscene.setVariable" || step["argumentVariables"] != null || step["resultVariables"] != null);

            var bindings = VulcanusLuaEngine.InspectBindings();
            var actions = bindings.Describe().modules
                .SelectMany(module => module.methods.Where(method => method.action != null && method.action.contexts.Contains("cutscene"))
                    .Select(method => (Module: module.path, Method: method)))
                .ToDictionary(entry => entry.Method.action.id, StringComparer.Ordinal);
            usedIds ??= new HashSet<string>(StringComparer.Ordinal);
            var lua = new StringBuilder();

            for (var index = 0; index < sequence.Count; index++)
            {
                var location = $"{source}: {section}[{index}]";
                if (sequence[index] is not JObject step) throw Invalid(location, "Expected a step object.");
                var id = RequiredString(step["id"], location, "id");
                location += $" ({id})";
                if (!usedIds.Add(id)) throw Invalid(location, "Duplicate step ID.");
                var actionId = RequiredString(step["action"], location, "action");
                if (trackSteps) lua.Append("__cutsceneStep(").Append(LuaString(id)).Append(");\n");
                if (actionId == "control.parallel")
                {
                    if (phase != "sequence" || path) throw Invalid(location, "Parallel blocks are allowed only at the top level of the main sequence.");
                    RejectUnknownFields(step, new[] { "id", "action", "arguments", "tracks" }, location);
                    if (step["arguments"] is not JObject parallelArguments) throw Invalid(location, "Expected empty parallel arguments.");
                    RejectUnknownFields(parallelArguments, Array.Empty<string>(), location);
                    if (step["tracks"] is not JArray tracks || tracks.Count < 2)
                        throw Invalid(location, "Parallel blocks require at least two nonempty tracks.");
                    imported.Add(new CutsceneStep(id, actionId, Array.Empty<CutsceneArgument>()));
                    var claims = new Dictionary<string, int>(StringComparer.Ordinal);
                    lua.Append("__cutsceneParallel({\n");
                    for (var trackIndex = 0; trackIndex < tracks.Count; trackIndex++)
                    {
                        var trackLocation = $"{location}, track {trackIndex + 1}";
                        if (tracks[trackIndex] is not JArray track || track.Count == 0)
                            throw Invalid(trackLocation, "Expected a nonempty action array.");
                        var trackLua = Compile(track, trackLocation, out var children, phase, usedIds, true, true, variables);
                        foreach (var child in children)
                        {
                            if (child.ActionId == "cutscene.runLua")
                                throw Invalid(trackLocation, $"Step '{child.Id}': Run Lua must be outside parallel blocks because its writes cannot be checked for conflicts.");
                            var resources = (child.ActionId == "cutscene.setVariable" ? Array.Empty<LuaParameterDescription>() : actions[child.ActionId].Method.parameters)
                                .Where(parameter => parameter.semanticType == "characterRef" && parameter.name == "character")
                                .Where(parameter => !child.Arguments.Single(argument => argument.Name == parameter.name).IsVariable)
                                .Select(parameter => "character:" + child.Arguments.Single(argument => argument.Name == parameter.name).Value)
                                .Concat(child.ActionId == "dialogue.play" ? new[] { "dialogue" } : Array.Empty<string>())
                                .Concat(child.ActionId.StartsWith("story.", StringComparison.Ordinal)
                                    ? child.Arguments.Where(argument => argument.Name == "key").Select(argument => "story:" + argument.Value)
                                    : Array.Empty<string>());
                            foreach (var resource in resources)
                            {
                                if (claims.TryGetValue(resource, out var owner) && owner != trackIndex)
                                    throw Invalid(trackLocation, $"Step '{child.Id}' conflicts with track {owner + 1} on '{resource}'.");
                                claims[resource] = trackIndex;
                            }
                        }
                        imported.AddRange(children);
                        lua.Append("function()\n").Append(trackLua).Append("end,\n");
                    }
                    ValidateParallelVariables(tracks, location);
                    lua.Append("});\n");
                    continue;
                }
                if (actionId == "control.if")
                {
                    if (phase != "sequence" || path) throw Invalid(location, "Conditional branches are allowed only at the top level of the main sequence.");
                    RejectUnknownFields(step, new[] { "id", "action", "arguments", "then", "else" }, location);
                    if (step["arguments"] is not JObject conditionArguments) throw Invalid(location, "Expected named condition argument.");
                    RejectUnknownFields(conditionArguments, new[] { "condition" }, location);
                    var condition = RequiredString(conditionArguments["condition"], location, "condition");
                    try { new Script(CoreModules.Preset_HardSandbox).LoadString("return (" + condition + "\n)", null, location); }
                    catch (SyntaxErrorException error) { throw Invalid(location, error.DecoratedMessage); }
                    if (step["then"] is not JArray ifPath || step["else"] is not JArray elsePath)
                        throw Invalid(location, "Expected both If and Else action arrays.");
                    imported.Add(new CutsceneStep(id, actionId, new[] { new CutsceneArgument("condition", condition) }));
                    var ifLua = Compile(ifPath, location + ".then", out var ifSteps, phase, usedIds, true, true, variables);
                    var elseLua = Compile(elsePath, location + ".else", out var elseSteps, phase, usedIds, true, true, variables);
                    imported.AddRange(ifSteps);
                    imported.AddRange(elseSteps);
                    lua.Append("if __cutsceneCondition(").Append(LuaString(condition)).Append(") then\n")
                        .Append(ifLua).Append("else\n").Append(elseLua).Append("end\n");
                    continue;
                }
                RejectUnknownFields(step, new[] { "id", "action", "arguments", "argumentVariables", "resultVariables" }, location);
                var setting = actionId == "cutscene.setVariable";
                if (setting && step["resultVariables"] != null) throw Invalid(location, "Set Variable has no outputs.");
                var target = setting ? locals.Require(RequiredString(step["arguments"]?["name"], location, "name")) : null;
                var found = actions.TryGetValue(actionId, out var action);
                if (setting) action = ("Cutscene", new LuaMethodDescription { name = "SetVariable", outputs = Array.Empty<LuaOutputDescription>(),
                    action = new LuaActionDescription { phases = new[] { "setup", "sequence", "completion" } },
                    parameters = new[] { new LuaParameterDescription { name = "name", type = "string" },
                        new LuaParameterDescription { name = "value", type = target.Type == "storyValue" || target.Type == "table" ? "boolean|string|number|table" : target.Type, nullable = target.Nullable } } });
                if (!found && !setting)
                    throw Invalid(location, $"Unsupported cutscene action '{actionId}'.");
                if (!action.Method.action.phases.Contains(phase))
                    throw Invalid(location, $"Action '{actionId}' is not allowed in phase '{phase}'.");
                if (step["arguments"] is not JObject arguments)
                    throw Invalid(location, "Expected named arguments.");
                var parameters = action.Method.parameters;
                RejectUnknownFields(arguments, parameters.Select(parameter => parameter.name), location);
                var links = step["argumentVariables"] as JObject ?? new JObject();
                if (step["argumentVariables"] != null && step["argumentVariables"] is not JObject) throw Invalid(location, "Expected named variable links.");
                RejectUnknownFields(links, parameters.Select(parameter => parameter.name), location);
                if (setting && links["name"] != null) throw Invalid(location, "Set Variable requires a literal destination name.");

                var literals = new string[parameters.Length];
                var importedArguments = new CutsceneArgument[parameters.Length];
                var values = new object[parameters.Length];
                for (var parameterIndex = 0; parameterIndex < parameters.Length; parameterIndex++)
                {
                    var parameter = parameters[parameterIndex];
                    if (links[parameter.name] != null)
                    {
                        if (arguments[parameter.name] != null) throw Invalid(location, $"'{parameter.name}' cannot have both a literal and a variable.");
                        var name = RequiredString(links[parameter.name], location, parameter.name);
                        var variable = locals.Require(name);
                        if (!LuaValues.Compatible(variable.Type, variable.Nullable, setting && parameter.name == "value" ? target.Type : parameter.type, parameter.nullable == true))
                            throw Invalid(location, $"Variable '{name}' does not match parameter '{parameter.name}' ({parameter.type}).");
                        importedArguments[parameterIndex] = new CutsceneArgument(parameter.name, name, true);
                        literals[parameterIndex] = "Cutscene.Variables[" + LuaString(name) + "]";
                        continue;
                    }
                    var authoredValue = arguments[parameter.name];
                    if (authoredValue == null && parameter.optional == true)
                        authoredValue = JToken.FromObject(parameter.defaultValue);
                    if (setting && parameter.name == "value" && authoredValue?.Type == JTokenType.Null && target.Nullable)
                    {
                        importedArguments[parameterIndex] = new CutsceneArgument(parameter.name);
                        literals[parameterIndex] = "nil";
                        continue;
                    }
                    if (setting && parameter.name == "value" && target.Type == "table")
                    {
                        if (authoredValue == null) throw Invalid(location, "Set Variable requires a value.");
                        LuaValues.RequireType(LuaValues.FromJson(authoredValue, new Script(CoreModules.Preset_HardSandbox)), "table");
                        importedArguments[parameterIndex] = new CutsceneArgument(parameter.name, authoredValue.ToString(Newtonsoft.Json.Formatting.None));
                        literals[parameterIndex] = JsonLiteral(authoredValue);
                        continue;
                    }
                    if (parameter.type == "boolean|string|number|table")
                    {
                        if (authoredValue == null) throw Invalid(location, $"'{parameter.name}' requires a story value.");
                        var json = authoredValue.ToString(Newtonsoft.Json.Formatting.None);
                        try { values[parameterIndex] = StoryValueJson.Parse(json); }
                        catch (Exception error) { throw new FormatException($"{location}: {parameter.name}: {error.Message}", error); }
                        importedArguments[parameterIndex] = new CutsceneArgument(parameter.name, json);
                        literals[parameterIndex] = StoryLiteral(((Core.Game.StoryValue)values[parameterIndex]).GetSnapshot());
                        continue;
                    }
                    if (parameter.type == "boolean")
                    {
                        var token = authoredValue;
                        if (token?.Type != JTokenType.Boolean)
                            throw Invalid(location, $"'{parameter.name}' requires a boolean.");
                        var boolean = token.Value<bool>();
                        importedArguments[parameterIndex] = new CutsceneArgument(parameter.name, boolean ? "true" : "false");
                        values[parameterIndex] = boolean;
                        literals[parameterIndex] = boolean ? "true" : "false";
                        continue;
                    }
                    if (parameter.type == "path")
                    {
                        if (arguments[parameter.name] is not JArray points || points.Count == 0)
                            throw Invalid(location, $"'{parameter.name}' requires a nonempty ordered list of positions.");
                        var mapPath = new MapPath(points.Select((point, index) => RequiredPosition(point, location, $"{parameter.name}[{index}]")).ToArray());
                        importedArguments[parameterIndex] = new CutsceneArgument(parameter.name, mapPath);
                        values[parameterIndex] = mapPath;
                        literals[parameterIndex] = "{ " + string.Join(", ", mapPath.Points.Select(PositionLiteral)) + " }";
                        continue;
                    }
                    if (parameter.type == "position")
                    {
                        if (parameter.nullable == true && arguments[parameter.name]?.Type == JTokenType.Null)
                        {
                            importedArguments[parameterIndex] = new CutsceneArgument(parameter.name);
                            values[parameterIndex] = null;
                            literals[parameterIndex] = "nil";
                            continue;
                        }
                        var position = RequiredPosition(arguments[parameter.name], location, parameter.name);
                        importedArguments[parameterIndex] = new CutsceneArgument(parameter.name, position);
                        values[parameterIndex] = position;
                        literals[parameterIndex] = PositionLiteral(position);
                        continue;
                    }
                    string value;
                    if (parameter.type == "string")
                    {
                        value = setting && parameter.name == "value" && authoredValue?.Type == JTokenType.String
                            ? (string)authoredValue : RequiredString(authoredValue, location, parameter.name);
                        values[parameterIndex] = value;
                        literals[parameterIndex] = LuaString(value);
                    }
                    else if (parameter.type == "number")
                    {
                        var token = authoredValue;
                        if (token == null || (token.Type != JTokenType.Integer && token.Type != JTokenType.Float))
                            throw Invalid(location, $"'{parameter.name}' requires a finite number.");
                        var number = token.Value<double>();
                        if (double.IsNaN(number) || double.IsInfinity(number))
                            throw Invalid(location, $"'{parameter.name}' requires a finite number.");
                        value = number.ToString("R", CultureInfo.InvariantCulture);
                        values[parameterIndex] = number;
                        literals[parameterIndex] = value;
                    }
                    else throw Invalid(location, $"The sequence compiler does not support parameter type '{parameter.type}'.");
                    importedArguments[parameterIndex] = new CutsceneArgument(parameter.name, value);
                }
                // Pure value checks run at import; scene reference checks run when binding the map.
                try { if (!setting && links.Count == 0) bindings.ValidateAuthoredActionArguments(actionId, values); }
                catch (Exception error) { throw new FormatException($"{location}: {error.Message}", error); }
                imported.Add(new CutsceneStep(id, actionId, importedArguments));
                if (setting)
                {
                    lua.Append("Cutscene.Variables[").Append(LuaString(target.Name)).Append("] = ").Append(literals[1]).Append(";\n");
                    continue;
                }
                if (links.Count > 0) lua.Append("__cutsceneDynamic();\n");
                var call = action.Module + "." + action.Method.name + "(" + string.Join(", ", literals) + ")";
                if (step["resultVariables"] is JArray destinations)
                {
                    var outputs = action.Method.outputs ?? Array.Empty<LuaOutputDescription>();
                    if (destinations.Count != outputs.Length || outputs.Length == 0) throw Invalid(location, "Result destinations must match the action's outputs.");
                    var seen = new HashSet<string>(StringComparer.Ordinal);
                    for (var outputIndex = 0; outputIndex < outputs.Length; outputIndex++)
                    {
                        if (destinations[outputIndex].Type == JTokenType.Null) continue;
                        var name = RequiredString(destinations[outputIndex], location, "resultVariables");
                        var variable = locals.Require(name);
                        if (!seen.Add(name) || !LuaValues.Compatible(outputs[outputIndex].type, outputs[outputIndex].nullable, variable.Type, variable.Nullable))
                            throw Invalid(location, $"Invalid or incompatible result destination '{name}'.");
                    }
                    var names = Enumerable.Range(0, outputs.Length).Select(index => "__result" + index).ToArray();
                    lua.Append("do local ").Append(string.Join(", ", names)).Append(" = ").Append(call).Append("; __cutsceneAssign({")
                        .Append(string.Join(", ", destinations.Select(token => token.Type == JTokenType.Null ? "false" : LuaString((string)token))))
                        .Append("}, ").Append(string.Join(", ", names)).Append("); end;\n");
                }
                else
                {
                    if (step["resultVariables"] != null) throw Invalid(location, "Expected an output destination array.");
                    lua.Append(call).Append(";\n");
                }
            }
            steps = imported.ToArray();
            return lua.ToString();
        }

        internal static CutsceneVariableDefinition[] ReadVariables(JArray source, string location)
        {
            var definitions = source.Select(token =>
            {
                if (token is not JObject variable) throw Invalid(location, "Expected a variable declaration.");
                RejectUnknownFields(variable, new[] { "name", "type", "initialValue", "nullable" }, location);
                if (variable["initialValue"] == null) throw Invalid(location, "Variable initialValue is required.");
                return new CutsceneVariableDefinition(RequiredString(variable["name"], location, "name"), RequiredString(variable["type"], location, "type"),
                    variable["initialValue"].ToString(Newtonsoft.Json.Formatting.None), (bool?)variable["nullable"] ?? false);
            }).ToArray();
            try { _ = new CutsceneVariables(definitions); }
            catch (Exception error) { throw Invalid(location, error.Message); }
            return definitions;
        }

        private static void ValidateParallelVariables(JArray tracks, string location)
        {
            var uses = tracks.Cast<JArray>().Select(track => (Reads: track.Cast<JObject>().SelectMany(step =>
                    (step["argumentVariables"] as JObject ?? new JObject()).Properties().Select(property => (string)property.Value)).ToHashSet(StringComparer.Ordinal),
                Writes: track.Cast<JObject>().SelectMany(step => (step["resultVariables"] as JArray ?? new JArray()).Where(value => value.Type == JTokenType.String).Values<string>()
                    .Concat((string)step["action"] == "cutscene.setVariable" ? new[] { (string)step["arguments"]["name"] } : Array.Empty<string>())).ToHashSet(StringComparer.Ordinal))).ToArray();
            for (var first = 0; first < uses.Length; first++)
                for (var second = first + 1; second < uses.Length; second++)
                    if (uses[first].Writes.Overlaps(uses[second].Reads.Concat(uses[second].Writes)) || uses[second].Writes.Overlaps(uses[first].Reads))
                        throw Invalid(location, $"Tracks {first + 1} and {second + 1} share a written variable; join before reading it in another track.");
        }

        private static string PositionLiteral(MapPosition position) => position.IsAnchor ? $"{{ anchor = {LuaString(position.Anchor)} }}" :
            $"{{ x = {position.X.ToString("R", CultureInfo.InvariantCulture)}, y = {position.Y.ToString("R", CultureInfo.InvariantCulture)} }}";

        private static string JsonLiteral(JToken token) => token switch
        {
            JObject obj => "{" + string.Join(",", obj.Properties().Select(property => "[" + LuaString(property.Name) + "]=" + JsonLiteral(property.Value))) + "}",
            JArray array => "{" + string.Join(",", array.Select(JsonLiteral)) + "}",
            _ when token.Type == JTokenType.Null => "nil",
            _ when token.Type == JTokenType.String => LuaString((string)token),
            _ => token.ToString(Newtonsoft.Json.Formatting.None)
        };

        private static string StoryLiteral(object value) => value switch
        {
            string text => LuaString(text),
            bool boolean => boolean ? "true" : "false",
            double number => number.ToString("R", CultureInfo.InvariantCulture),
            System.Collections.Generic.Dictionary<string, object> dictionary => "{ " + string.Join(", ", dictionary.Select(pair =>
                $"[{LuaString(pair.Key)}] = {StoryLiteral(pair.Value)}")) + " }",
            _ => throw new FormatException("Invalid story action value.")
        };

        private static string RequiredString(JToken value, string location, string name)
        {
            if (value?.Type != JTokenType.String || string.IsNullOrWhiteSpace(value.Value<string>()))
                throw Invalid(location, $"'{name}' requires a non-empty string.");
            return value.Value<string>();
        }

        internal static MapPosition RequiredPosition(JToken token, string location, string name)
        {
            if (token is not JObject point) throw Invalid(location, $"'{name}' requires a position object with x/y numbers.");
            if (point.Property("anchor") != null)
            {
                RejectUnknownFields(point, new[] { "anchor" }, location + "." + name);
                return new MapPosition(RequiredString(point["anchor"], location, name + ".anchor"));
            }
            RejectUnknownFields(point, new[] { "x", "y" }, location + "." + name);
            foreach (var axis in new[] { "x", "y" })
                if (point[axis] == null || point[axis].Type is not (JTokenType.Integer or JTokenType.Float))
                    throw Invalid(location, $"'{name}.{axis}' requires a finite, nonnegative number.");
            try { return new MapPosition(point["x"].Value<double>(), point["y"].Value<double>()); }
            catch (ArgumentOutOfRangeException error) { throw new FormatException($"{location}: '{name}': {error.Message}", error); }
        }

        private static void RejectUnknownFields(JObject value, IEnumerable<string> allowed, string location)
        {
            var names = new HashSet<string>(allowed, StringComparer.Ordinal);
            foreach (var field in value.Properties())
                if (!names.Contains(field.Name)) throw Invalid(location, $"Unknown field '{field.Name}'.");
        }

        private static string LuaString(string value)
        {
            var result = new StringBuilder("\"");
            foreach (var character in value)
            {
                if (character == '\\' || character == '"') result.Append('\\').Append(character);
                else if (character < ' ' || character == '\u007f')
                    result.Append('\\').Append(((int)character).ToString("D3", CultureInfo.InvariantCulture));
                else result.Append(character);
            }
            return result.Append('"').ToString();
        }

        private static FormatException Invalid(string location, string message) => new($"{location}: {message}");
    }
}

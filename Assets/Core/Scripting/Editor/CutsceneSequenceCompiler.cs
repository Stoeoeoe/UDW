using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;

namespace Core.Scripting.Editor
{
    /// <summary>Emits one Lua call per authored step; the definition retains the steps for diagnostics.</summary>
    internal static class CutsceneSequenceCompiler
    {
        public static string Compile(JArray sequence, string source) => Compile(sequence, source, out _);

        public static string Compile(JArray sequence, string source, out CutsceneStep[] steps,
            string phase = "sequence", ISet<string> usedIds = null)
        {
            if (sequence == null) throw new ArgumentNullException(nameof(sequence));
            if (string.IsNullOrWhiteSpace(source)) throw new ArgumentException("Source identity is required.", nameof(source));
            var section = phase switch { "setup" => "onStart", "sequence" => "sequence", "completion" => "onComplete.steps",
                _ => throw new ArgumentException("Unknown cutscene phase.", nameof(phase)) };
            if (phase == "sequence" && sequence.Count == 0) throw Invalid(source, "The sequence needs at least one step.");
            steps = new CutsceneStep[sequence.Count];

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
                RejectUnknownFields(step, new[] { "id", "action", "arguments" }, location);
                var actionId = RequiredString(step["action"], location, "action");
                if (!actions.TryGetValue(actionId, out var action))
                    throw Invalid(location, $"Unsupported cutscene action '{actionId}'.");
                if (!action.Method.action.phases.Contains(phase))
                    throw Invalid(location, $"Action '{actionId}' is not allowed in phase '{phase}'.");
                if (step["arguments"] is not JObject arguments)
                    throw Invalid(location, "Expected named arguments.");
                var parameters = action.Method.parameters;
                RejectUnknownFields(arguments, parameters.Select(parameter => parameter.name), location);

                var literals = new string[parameters.Length];
                var importedArguments = new CutsceneArgument[parameters.Length];
                var values = new object[parameters.Length];
                for (var parameterIndex = 0; parameterIndex < parameters.Length; parameterIndex++)
                {
                    var parameter = parameters[parameterIndex];
                    var authoredValue = arguments[parameter.name];
                    if (authoredValue == null && parameter.optional == true)
                        authoredValue = JToken.FromObject(parameter.defaultValue);
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
                        var path = new MapPath(points.Select((point, index) => RequiredPosition(point, location, $"{parameter.name}[{index}]")).ToArray());
                        importedArguments[parameterIndex] = new CutsceneArgument(parameter.name, path);
                        values[parameterIndex] = path;
                        literals[parameterIndex] = "{ " + string.Join(", ", path.Points.Select(PositionLiteral)) + " }";
                        continue;
                    }
                    if (parameter.type == "position")
                    {
                        var position = RequiredPosition(arguments[parameter.name], location, parameter.name);
                        importedArguments[parameterIndex] = new CutsceneArgument(parameter.name, position);
                        values[parameterIndex] = position;
                        literals[parameterIndex] = PositionLiteral(position);
                        continue;
                    }
                    string value;
                    if (parameter.type == "string")
                    {
                        value = RequiredString(authoredValue, location, parameter.name);
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
                try { bindings.ValidateAuthoredActionArguments(actionId, values); }
                catch (Exception error) { throw new FormatException($"{location}: {error.Message}", error); }
                steps[index] = new CutsceneStep(id, actionId, importedArguments);
                lua.Append(action.Module).Append('.').Append(action.Method.name).Append('(')
                    .Append(string.Join(", ", literals)).Append(");\n");
            }
            return lua.ToString();
        }

        private static string PositionLiteral(MapPosition position) => position.IsAnchor ? $"{{ anchor = {LuaString(position.Anchor)} }}" :
            $"{{ x = {position.X.ToString("R", CultureInfo.InvariantCulture)}, y = {position.Y.ToString("R", CultureInfo.InvariantCulture)} }}";

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

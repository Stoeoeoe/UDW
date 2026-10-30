using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using MoonSharp.Interpreter;
using Newtonsoft.Json.Linq;

namespace Core.Scripting.Editor
{
    /// <summary>Compiles structured execution and typed data wires to the existing awaited Lua runner.</summary>
    internal sealed class CutsceneGraphCompiler
    {
        private readonly Dictionary<string, JObject> _nodes;
        private readonly Dictionary<string, JObject> _inputs = new(StringComparer.Ordinal);
        private readonly Dictionary<string, JObject> _next = new(StringComparer.Ordinal);
        private readonly HashSet<string> _executionInputs = new(StringComparer.Ordinal);
        private readonly Dictionary<string, LuaMethodDescription> _actions;
        private readonly Dictionary<string, LuaMethodDescription> _functions;
        private readonly Dictionary<string, (LuaParameterDescription[] Inputs, LuaOutputDescription[] Outputs)> _signatures = new(StringComparer.Ordinal);
        private readonly List<CutsceneVariableDefinition> _variables;
        private readonly CutsceneVariableDefinition[] _authoredVariables;
        private readonly string _source, _phase;
        private readonly HashSet<string> _used, _visited = new(StringComparer.Ordinal);
        private readonly List<CutsceneStep> _steps = new();
        private readonly StringBuilder _lua = new("local __graphResults = {};\n");
        private int _symbol;

        private CutsceneGraphCompiler(JObject graph, string source, string phase, ISet<string> used,
            IReadOnlyList<CutsceneVariableDefinition> variables)
        {
            _source = source; _phase = phase; _used = new HashSet<string>(used, StringComparer.Ordinal);
            _authoredVariables = variables.ToArray();
            _variables = variables.ToList();
            var bindings = VulcanusLuaEngine.InspectBindings().Describe();
            _actions = bindings.modules.SelectMany(m => m.methods).Where(m => m.action != null && m.action.contexts.Contains("cutscene"))
                .ToDictionary(m => m.action.id, StringComparer.Ordinal);
            _functions = bindings.modules.SelectMany(m => m.methods.Where(f => !f.writesState && (f.action == null || f.callable == true) && f.outputs?.Length > 0).Select(f => (Path: m.path + "." + f.name, Method: f))).ToDictionary(f => f.Path, f => f.Method);
            var nodeList = (JArray)graph["nodes"];
            if (nodeList == null) throw Invalid("Expected graph nodes.");
            _nodes = new Dictionary<string, JObject>(StringComparer.Ordinal);
            foreach (var token in nodeList)
            {
                if (token is not JObject n || !(_nodes.TryAdd(Text(n, "id"), n))) throw Invalid("Invalid or duplicate graph node.");
            }
            if (_nodes.Values.Count(n => Kind(n) == "entry") != 1 || _nodes.Values.Count(n => Kind(n) == "exit") != 1)
                throw Invalid("A graph needs exactly one entry and exit.");
            foreach (var n in _nodes.Values) _signatures.Add(Text(n, "id"), Signature(n));
            foreach (var n in _nodes.Values)
            {
                var fields = Kind(n) switch
                {
                    "action" => new[] { "step" }, "function" => new[] { "method", "arguments" }, "variable" => new[] { "variable" },
                    "position" => new[] { "arguments" }, "expression" => new[] { "expression", "outputs" },
                    "lua" => new[] { "expression", "outputs", "resultVariables" }, "branch" => new[] { "arguments", "pair" },
                    "parallel" => new[] { "pair", "tracks" }, "join" => new[] { "pair" }, _ => Array.Empty<string>()
                };
                if (n.Properties().Any(p => !new[] { "id", "kind", "position", "comment" }.Concat(fields).Contains(p.Name))) throw Invalid($"{n["id"]}: fields do not match node kind.");
                if ((n["comment"] != null || Kind(n) == "comment") && n["comment"]?.Type != JTokenType.String)
                    throw Invalid($"{n["id"]}: comment must be text.");
                if (n["arguments"] is JObject a && a.Properties().Any(p => !_signatures[Text(n, "id")].Inputs.Any(i => i.name == p.Name))) throw Invalid($"{n["id"]}: unknown argument.");
                var destinations = n["step"]?["resultVariables"] ?? n["resultVariables"];
                if (destinations is JArray results) ValidateDestinations(Text(n, "id"), results);
                if (n["step"]?["argumentVariables"] is JObject links)
                    foreach (var link in links.Properties())
                    {
                        var definition = _authoredVariables.SingleOrDefault(v => v.Name == (string)link.Value);
                        var parameter = _signatures[Text(n, "id")].Inputs.SingleOrDefault(p => p.name == link.Name);
                        if (definition == null || parameter == null || !LuaValues.Compatible(definition.Type, definition.Nullable, InputType(parameter.type), parameter.nullable == true)) throw Invalid($"{n["id"]}: missing or incompatible input variable '{link.Value}'.");
                    }
            }
            var edgeIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var token in (JArray)graph["edges"])
            {
                if (token is not JObject e || !edgeIds.Add(Text(e, "id"))) throw Invalid("Invalid or duplicate connection.");
                var from = Node(Text(e, "source")); var to = Node(Text(e, "target"));
                if (Kind(from) == "comment" || Kind(to) == "comment") throw Invalid("Comment nodes cannot have connections.");
                if (ReferenceEquals(from, to)) throw Invalid("Self connections are not allowed.");
                var sourcePin = Text(e, "sourcePin"); var targetPin = Text(e, "targetPin");
                if (Text(e, "kind") == "data")
                {
                    if (to["step"]?["argumentVariables"]?[targetPin] != null) throw Invalid("An input cannot have both a variable binding and data wire.");
                    var output = _signatures[Text(from, "id")].Outputs.SingleOrDefault(p => p.name == sourcePin);
                    var input = _signatures[Text(to, "id")].Inputs.SingleOrDefault(p => p.name == targetPin);
                    if (input == null || output == null || !LuaValues.Compatible(output.type, output.nullable, InputType(input.type), input.nullable == true))
                        throw Invalid($"Connection '{e["id"]}' has missing or incompatible data pins.");
                    if (!_inputs.TryAdd(Text(to, "id") + "/" + targetPin, e)) throw Invalid("An input has multiple data connections.");
                }
                else
                {
                    var inputId = Text(to, "id") + "/" + targetPin;
                    if (!_executionInputs.Add(inputId)) throw Invalid("An execution input has multiple connections.");
                    if (Kind(to) == "join")
                    {
                        var owner = Node(Text(to, "pair"));
                        var count = Kind(owner) == "branch" ? 2 : (int?)owner["tracks"] ?? 0;
                        if (Kind(owner) is not ("branch" or "parallel") || Text(owner, "pair") != Text(to, "id") || !Enumerable.Range(0, count).Select(i => "track-" + i).Contains(targetPin)) throw Invalid("Invalid join input.");
                    }
                    var pins = Kind(from) == "parallel" ? Enumerable.Range(0, (int?)from["tracks"] ?? 0).Select(i => "track-" + i)
                        : Kind(from) == "branch" ? new[] { "then", "else" } : new[] { "next" };
                    if (Pure(from) || Pure(to) || Kind(from) == "exit" || Kind(to) == "entry" || !pins.Contains(sourcePin) || Kind(to) != "join" && targetPin != "in")
                        throw Invalid("Invalid execution pins.");
                    if (!_next.TryAdd(Text(from, "id") + "/" + sourcePin, e)) throw Invalid("An execution output has multiple connections.");
                }
            }
            foreach (var n in _nodes.Values.Where(n => Kind(n) == "join"))
            {
                var owner = Node(Text(n, "pair"));
                if (Kind(owner) is not ("branch" or "parallel") || Text(owner, "pair") != Text(n, "id")) throw Invalid("Unmatched join.");
                var count = Kind(owner) == "branch" ? 2 : (int?)owner["tracks"] ?? 0;
                for (var i = 0; i < count; i++) if (!_executionInputs.Contains(Text(n, "id") + "/track-" + i)) throw Invalid($"{n["id"]}: connect track {i + 1}.");
            }
            // Check every pure node, including unused authored expressions, before playback.
            foreach (var n in _nodes.Values.Where(Pure))
                Value(Text(n, "id"), new HashSet<string>(_nodes.Keys), new HashSet<string>(), new Dictionary<string, string>(), new StringBuilder());
        }

        public static string Compile(JObject graph, string source, string phase, ISet<string> used,
            IReadOnlyList<CutsceneVariableDefinition> variables, out CutsceneStep[] steps)
        {
            var compiler = new CutsceneGraphCompiler(graph, source, phase, used, variables);
            compiler.Walk(compiler.Text(compiler._nodes.Values.Single(n => Kind(n) == "entry"), "id"), null, new HashSet<string>(), false);
            foreach (var n in compiler._nodes.Values.Where(n => !Pure(n) && Kind(n) != "comment"))
                if (!compiler._visited.Contains(compiler.Text(n, "id"))) throw compiler.Invalid($"Node '{n["id"]}' is disconnected from execution.");
            foreach (var id in compiler._used) used.Add(id);
            steps = compiler._steps.ToArray();
            if (phase == "sequence" && steps.Length == 0) throw compiler.Invalid("The sequence graph needs an action.");
            return compiler._lua.ToString();
        }

        private (LuaParameterDescription[], LuaOutputDescription[]) Signature(JObject n)
        {
            var id = Text(n, "id");
            switch (Kind(n))
            {
                case "function":
                    if (!_functions.TryGetValue(Text(n, "method"), out var function)) throw Invalid($"{id}: unsupported read-only function.");
                    return (function.parameters, function.outputs);
                case "action":
                    if (n["step"] is not JObject step || (string)step["id"] != id) throw Invalid($"{id}: requires an action step with the same ID.");
                    if ((string)step["action"] == "cutscene.setVariable")
                    {
                        var variable = _variables.SingleOrDefault(v => v.Name == (string)step["arguments"]?["name"])
                            ?? throw Invalid($"{id}: unknown Set Variable destination.");
                        return (new[] { new LuaParameterDescription { name = "name", type = "string" }, new LuaParameterDescription { name = "value", type = variable.Type, nullable = variable.Nullable } }, Array.Empty<LuaOutputDescription>());
                    }
                    if (!_actions.TryGetValue(Text(step, "action"), out var method)) throw Invalid($"{id}: unsupported action.");
                    if (!method.action.phases.Contains(_phase)) throw Invalid($"{id}: action is not allowed in {_phase}.");
                    return (method.parameters, method.outputs ?? Array.Empty<LuaOutputDescription>());
                case "variable":
                    var definition = _variables.SingleOrDefault(v => v.Name == (string)n["variable"]) ?? throw Invalid($"{id}: unknown variable.");
                    return (Array.Empty<LuaParameterDescription>(), new[] { new LuaOutputDescription { name = "value", type = definition.Type, nullable = definition.Nullable } });
                case "position": return (new[] { new LuaParameterDescription { name = "x", type = "number" }, new LuaParameterDescription { name = "y", type = "number" } }, new[] { new LuaOutputDescription { name = "position", type = "position" } });
                case "expression": case "lua":
                    var outputs = n["outputs"]?.ToObject<LuaOutputDescription[]>() ?? Array.Empty<LuaOutputDescription>();
                    if (outputs.Length == 0 || outputs.Select(o => o.name).Distinct().Count() != outputs.Length || Kind(n) == "expression" && outputs.Length != 1)
                        throw Invalid($"{id}: declare distinct typed results (one for a read-only expression).");
                    var expression = Text(n, "expression");
                    try { new Script(CoreModules.Preset_HardSandbox).LoadString(Kind(n) == "expression" ? "return (" + expression + "\n)" : expression); }
                    catch (SyntaxErrorException error) { throw Invalid($"{id}: {error.DecoratedMessage}"); }
                    return (Array.Empty<LuaParameterDescription>(), outputs);
                case "branch": return (new[] { new LuaParameterDescription { name = "condition", type = "boolean" } }, Array.Empty<LuaOutputDescription>());
                case "entry": case "exit": case "parallel": case "join": case "comment": return (Array.Empty<LuaParameterDescription>(), Array.Empty<LuaOutputDescription>());
                default: throw Invalid($"{id}: unsupported node kind.");
            }
        }

        private string Input(JObject n, LuaParameterDescription input, HashSet<string> known, HashSet<string> stack,
            Dictionary<string, string> memo, StringBuilder prelude)
        {
            var id = Text(n, "id");
            if (_inputs.TryGetValue(id + "/" + input.name, out var e))
            {
                var source = Node(Text(e, "source"));
                var value = Value(Text(source, "id"), known, stack, memo, prelude);
                var index = Array.FindIndex(_signatures[Text(source, "id")].Outputs, p => p.name == Text(e, "sourcePin"));
                return value + "[" + (index + 1) + "]";
            }
            var argument = n["arguments"]?[input.name] ?? (input.optional == true ? JToken.FromObject(input.defaultValue) : null);
            if (argument == null) throw Invalid($"{id}: missing {input.name}.");
            LuaValues.RequireType(LuaValues.FromJson(argument, new Script(CoreModules.Preset_HardSandbox)), InputType(input.type), input.nullable == true);
            if (Kind(n) == "function" && input.type == "string" && input.optional != true && argument.Type == JTokenType.String && string.IsNullOrWhiteSpace((string)argument)) throw Invalid($"{id}: enter {input.name}.");
            if (input.type == "integer" && (argument.Value<double>() % 1 != 0 || argument.Value<double>() < int.MinValue || argument.Value<double>() > int.MaxValue)) throw Invalid($"{id}: {input.name} requires a 32-bit integer.");
            if (Kind(n) == "position" && (argument.Value<double>() < 0 || argument.Value<double>() % 1 != 0 || argument.Value<double>() > int.MaxValue)) throw Invalid($"{id}: position coordinates must be nonnegative integer map pixels.");
            return CutsceneSequenceCompiler.JsonLiteral(argument);
        }

        private string Value(string id, HashSet<string> known, HashSet<string> stack, Dictionary<string, string> memo, StringBuilder prelude)
        {
            var n = Node(id);
            if (!Pure(n))
            {
                if (!known.Contains(id)) throw Invalid($"{id}: output is not guaranteed to have completed before its consumer.");
                return "__graphResults[" + Quote(id) + "]";
            }
            if (memo.TryGetValue(id, out var cached)) return cached;
            if (!stack.Add(id)) throw Invalid($"{id}: cycle between read-only values.");
            string expression;
            if (Kind(n) == "variable") expression = "{Cutscene.Variables[" + Quote(Text(n, "variable")) + "]}";
            else if (Kind(n) == "expression")
            {
                var output = _signatures[id].Outputs[0];
                expression = "{__cutsceneValue(" + Quote(Text(n, "expression")) + "," + Quote(output.type) + "," + Bool(output.nullable) + ")}";
            }
            else if (Kind(n) == "function") expression = "{__cutscenePure(" + Quote(Text(n, "method")) + ",{" + string.Join(",", _signatures[id].Inputs.Select(p => Input(n, p, known, stack, memo, prelude))) + "}," + _signatures[id].Inputs.Length + ")}";
            else expression = "{{x=" + Input(n, _signatures[id].Inputs[0], known, stack, memo, prelude) + ",y=" + Input(n, _signatures[id].Inputs[1], known, stack, memo, prelude) + "}}";
            var local = "__pure" + _symbol++;
            prelude.Append("local ").Append(local).Append(" = ").Append(expression).Append(";\n");
            memo.Add(id, local); stack.Remove(id); return local;
        }

        private void Walk(string id, string stop, HashSet<string> known, bool track, bool parallelTrack = false)
        {
            while (id != stop)
            {
                var n = Node(id); var kind = Kind(n);
                if (!_visited.Add(id) || Pure(n) || kind == "join") throw Invalid($"{id}: cyclic, shared or unmatched execution path.");
                if (kind == "exit") { if (stop != null) throw Invalid($"{id}: track exits without its join."); return; }
                if (kind == "entry") { id = Next(id); continue; }
                if (kind is "parallel" or "branch")
                {
                    if (_phase != "sequence" || track) throw Invalid($"{id}: control blocks belong at the top level of Sequence.");
                    var join = Node(Text(n, "pair"));
                    if (Kind(join) != "join" || Text(join, "pair") != id) throw Invalid($"{id}: unmatched join.");
                    var count = kind == "parallel" ? (int?)n["tracks"] ?? 0 : 2;
                    if (count < 2) throw Invalid($"{id}: at least two tracks required.");
                    if (!_used.Add(id)) throw Invalid($"{id}: duplicate step ID.");
                    _steps.Add(new CutsceneStep(id, kind == "parallel" ? "control.parallel" : "control.if", Array.Empty<CutsceneArgument>()));
                    _lua.Append("__cutsceneStep(").Append(Quote(id)).Append(");\n");
                    if (kind == "parallel") _lua.Append("__cutsceneParallel({\n");
                    else
                    {
                        var prelude = new StringBuilder();
                        var condition = Input(n, _signatures[id].Inputs[0], known, new HashSet<string>(), new Dictionary<string, string>(), prelude);
                        _lua.Append(prelude).Append("if ").Append(condition).Append(" then\n");
                    }
                    var paths = new List<HashSet<string>>();
                    var childSteps = new List<CutsceneStep[]>();
                    for (var index = 0; index < count; index++)
                    {
                        var pathKnown = new HashSet<string>(known); var before = _steps.Count;
                        if (kind == "parallel") _lua.Append("function()\n");
                        else if (index == 1) _lua.Append("else\n");
                        Walk(Next(id, kind == "parallel" ? "track-" + index : index == 0 ? "then" : "else"), Text(join, "id"), pathKnown, true, kind == "parallel");
                        childSteps.Add(_steps.Skip(before).ToArray()); paths.Add(pathKnown);
                        if (kind == "parallel") { if (_steps.Count == before) throw Invalid($"{id}: empty parallel track."); _lua.Append("end,\n"); }
                    }
                    if (kind == "parallel") { CheckClaims(childSteps, id); _lua.Append("});\n"); foreach (var path in paths) known.UnionWith(path); }
                    else { _lua.Append("end;\n"); known.UnionWith(paths[0].Where(value => paths.All(path => path.Contains(value)))); }
                    if (!_visited.Add(Text(join, "id"))) throw Invalid("Join already used.");
                    id = Next(Text(join, "id")); continue;
                }
                if (kind == "lua" && parallelTrack) throw Invalid($"{id}: Run Lua must be outside parallel tracks.");
                var step = kind == "lua" ? new JObject { ["id"] = id, ["action"] = "cutscene.runLua", ["arguments"] = new JObject { ["code"] = (string)n["expression"] } } : (JObject)n["step"].DeepClone();
                var pre = new StringBuilder("do\n"); var replacements = new Dictionary<string, string>();
                var memo = new Dictionary<string, string>();
                foreach (var input in _signatures[id].Inputs)
                {
                    if (!_inputs.ContainsKey(id + "/" + input.name)) continue;
                    if ((string)step["action"] == "cutscene.setVariable" && input.name == "name") throw Invalid("Set Variable destination must be literal.");
                    var sourceNode = Node(Text(_inputs[id + "/" + input.name], "source"));
                    if (Kind(sourceNode) == "position" && !_inputs.Values.Any(e => (string)e["target"] == Text(sourceNode, "id")))
                    {
                        // Literal Make Position inputs remain authored literals for map binding validation.
                        ((JObject)step["arguments"])[input.name] = sourceNode["arguments"].DeepClone();
                        if (step["argumentVariables"] is JObject existingLinks) existingLinks.Remove(input.name);
                        continue;
                    }
                    var expression = Input(n, input, known, new HashSet<string>(), memo, pre);
                    var symbol = "__graph_input_" + _symbol++;
                    while (_variables.Any(v => v.Name == symbol)) symbol += "_";
                    _variables.Add(new CutsceneVariableDefinition(symbol, InputType(input.type), Initial(input.type, input.nullable == true), input.nullable == true));
                    ((JObject)step["arguments"]).Remove(input.name);
                    var links = (JObject)step["argumentVariables"] ?? new JObject(); links[input.name] = symbol; step["argumentVariables"] = links;
                    replacements.Add("Cutscene.Variables[" + Quote(symbol) + "]", expression);
                }
                _lua.Append("__cutsceneStep(").Append(Quote(id)).Append(");\n").Append(pre);
                string Capture(string call)
                {
                    if (kind == "lua") call = "__cutsceneLua(" + Quote(Text(n, "expression")) + "," + _signatures[id].Outputs.Length + ")";
                    var outputs = _signatures[id].Outputs;
                    if (outputs.Length == 0) return call;
                    var names = outputs.Select((_, i) => "r" + i).ToArray();
                    var checks = string.Join(";", outputs.Select((o, i) => names[i] + "=__cutsceneCheck(" + names[i] + "," + Quote(o.type) + "," + Bool(o.nullable) + ")"));
                    return "(function() local " + string.Join(",", names) + "=" + call + ";" + checks + ";__graphResults[" + Quote(id) + "]={" + string.Join(",", names) + "};return " + string.Join(",", names) + ";end)()";
                }
                var code = CutsceneSequenceCompiler.Compile(new JArray(step), _source, out var compiled, _phase, _used, path: true, trackSteps: true, variables: _variables, transformCall: Capture);
                foreach (var replacement in replacements) code = code.Replace(replacement.Key, replacement.Value);
                _steps.AddRange(compiled); _lua.Append(code);
                if (kind == "lua" && n["resultVariables"] is JArray destinations) AssignResults(id, destinations);
                _lua.Append("end;\n"); known.Add(id); id = Next(id);
            }
        }

        private void ValidateDestinations(string id, JArray destinations)
        {
            var outputs = _signatures[id].Outputs;
            if (destinations.Count != outputs.Length) throw Invalid($"{id}: result destinations must match outputs.");
            var names = new HashSet<string>();
            for (var i = 0; i < outputs.Length; i++)
            {
                if (destinations[i].Type == JTokenType.Null) continue;
                var name = (string)destinations[i]; var v = _authoredVariables.SingleOrDefault(v => v.Name == name);
                if (v == null || !names.Add(name) || !LuaValues.Compatible(outputs[i].type, outputs[i].nullable, v.Type, v.Nullable)) throw Invalid($"{id}: incompatible result destination.");
            }
        }

        private void AssignResults(string id, JArray destinations)
        {
            ValidateDestinations(id, destinations);
            var outputs = _signatures[id].Outputs;
            _lua.Append("__cutsceneAssign({").Append(string.Join(",", destinations.Select(d => d.Type == JTokenType.Null ? "false" : Quote((string)d)))).Append("},")
                .Append(string.Join(",", outputs.Select((_, i) => "__graphResults[" + Quote(id) + "][" + (i + 1) + "]"))).Append(");\n");
        }

        private void CheckClaims(List<CutsceneStep[]> tracks, string id)
        {
            var accesses = tracks.Select(track =>
            {
                var reads = new HashSet<string>(); var writes = new HashSet<string>(); var seen = new HashSet<string>(); var unknownRead = false;
                void Read(string nodeId)
                {
                    if (!seen.Add(nodeId)) return;
                    var n = Node(nodeId);
                    if (Kind(n) == "variable") reads.Add(Text(n, "variable"));
                    if (Kind(n) == "expression" && Text(n, "expression").Contains("Cutscene.Variables")) unknownRead = true;
                    foreach (var e in _inputs.Values.Where(e => (string)e["target"] == nodeId)) if (Pure(Node(Text(e, "source")))) Read(Text(e, "source"));
                }
                foreach (var step in track)
                {
                    Read(step.Id); var n = Node(step.Id);
                    if (n["step"]?["argumentVariables"] is JObject links) foreach (var link in links.Properties()) reads.Add((string)link.Value);
                    if ((n["step"]?["resultVariables"] ?? n["resultVariables"]) is JArray results) foreach (var name in results.Where(t => t.Type == JTokenType.String)) writes.Add((string)name);
                    if (step.ActionId == "cutscene.setVariable") writes.Add((string)n["step"]["arguments"]["name"]);
                }
                return (Reads: reads, Writes: writes, Unknown: unknownRead);
            }).ToArray();
            for (var a = 0; a < accesses.Length; a++) for (var b = a + 1; b < accesses.Length; b++)
                if (accesses[a].Writes.Any(name => accesses[b].Reads.Contains(name) || accesses[b].Writes.Contains(name) || accesses[b].Unknown) || accesses[b].Writes.Any(name => accesses[a].Reads.Contains(name) || accesses[a].Unknown))
                    throw Invalid($"{id}: parallel tracks conflict on cutscene variables.");
            var owners = new Dictionary<string, int>();
            for (var index = 0; index < tracks.Count; index++) foreach (var step in tracks[index])
            {
                if (step.ActionId == "cutscene.runLua") throw Invalid($"{id}: Run Lua must be outside parallel tracks.");
                var claims = step.Arguments.Where(a => !a.IsVariable && (a.Name == "character" || step.ActionId.StartsWith("story.") && a.Name == "key"))
                    .Select(a => a.Name + ":" + a.Value).Concat(step.ActionId == "dialogue.play" ? new[] { "dialogue" } : Array.Empty<string>());
                foreach (var claim in claims)
                {
                    if (owners.TryGetValue(claim, out var owner) && owner != index) throw Invalid($"{id}: parallel tracks conflict on {claim}.");
                    owners[claim] = index;
                }
            }
        }

        private string Next(string id, string pin = "next") => _next.TryGetValue(id + "/" + pin, out var e) ? Text(e, "target") : throw Invalid($"{id}: connect {pin}.");
        private JObject Node(string id) => _nodes.TryGetValue(id, out var n) ? n : throw Invalid($"Missing graph node '{id}'.");
        private static string Kind(JObject n) => (string)n["kind"];
        private static bool Pure(JObject n) => Kind(n) is "function" or "variable" or "position" or "expression";
        private string Text(JObject n, string field) => n[field]?.Type == JTokenType.String && !string.IsNullOrWhiteSpace((string)n[field]) ? (string)n[field] : throw Invalid($"{n["id"]}: requires {field}.");
        private FormatException Invalid(string message) => new($"{_source}, graph {_phase}: {message}");
        private static string Quote(string value) => CutsceneSequenceCompiler.LuaString(value);
        private static string Bool(bool value) => value ? "true" : "false";
        private static string InputType(string type) => type == "integer" ? "number" : LuaValues.CanonicalType(type);
        private static string Initial(string type, bool nullable) => nullable ? "null" : type switch { "number" or "integer" => "0", "boolean" => "false", "string" => "\"graph\"", "position" => "{\"x\":0,\"y\":0}", "path" => "[{\"x\":0,\"y\":0}]", _ => "{}" };
    }
}

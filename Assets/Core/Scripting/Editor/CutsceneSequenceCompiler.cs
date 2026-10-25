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

        public static string Compile(JArray sequence, string source, out CutsceneStep[] steps)
        {
            if (sequence == null) throw new ArgumentNullException(nameof(sequence));
            if (string.IsNullOrWhiteSpace(source)) throw new ArgumentException("Source identity is required.", nameof(source));
            if (sequence.Count == 0) throw Invalid(source, "The sequence needs at least one step.");
            steps = new CutsceneStep[sequence.Count];

            var bindings = VulcanusLuaEngine.InspectBindings();
            var actions = bindings.Describe().modules
                .SelectMany(module => module.methods.Where(method => method.action != null && method.action.contexts.Contains("cutscene"))
                    .Select(method => (Module: module.path, Method: method)))
                .ToDictionary(entry => entry.Method.action.id, StringComparer.Ordinal);
            var usedIds = new HashSet<string>(StringComparer.Ordinal);
            var lua = new StringBuilder();

            for (var index = 0; index < sequence.Count; index++)
            {
                var location = $"{source}: sequence[{index}]";
                if (sequence[index] is not JObject step) throw Invalid(location, "Expected a step object.");
                var id = RequiredString(step["id"], location, "id");
                location += $" ({id})";
                if (!usedIds.Add(id)) throw Invalid(location, "Duplicate step ID.");
                RejectUnknownFields(step, new[] { "id", "action", "arguments" }, location);
                var actionId = RequiredString(step["action"], location, "action");
                if (!actions.TryGetValue(actionId, out var action))
                    throw Invalid(location, $"Unsupported cutscene action '{actionId}'.");
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
                    string value;
                    if (parameter.type == "string")
                    {
                        value = RequiredString(arguments[parameter.name], location, parameter.name);
                        values[parameterIndex] = value;
                        literals[parameterIndex] = LuaString(value);
                    }
                    else if (parameter.type == "number")
                    {
                        var token = arguments[parameter.name];
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

        private static string RequiredString(JToken value, string location, string name)
        {
            if (value?.Type != JTokenType.String || string.IsNullOrWhiteSpace(value.Value<string>()))
                throw Invalid(location, $"'{name}' requires a non-empty string.");
            return value.Value<string>();
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

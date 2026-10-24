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
        public static string Compile(JArray sequence, string source)
        {
            if (sequence == null) throw new ArgumentNullException(nameof(sequence));
            if (string.IsNullOrWhiteSpace(source)) throw new ArgumentException("Source identity is required.", nameof(source));
            if (sequence.Count == 0) throw Invalid(source, "The sequence needs at least one step.");

            var actions = VulcanusLuaEngine.DescribeBindings().modules
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
                for (var parameterIndex = 0; parameterIndex < parameters.Length; parameterIndex++)
                {
                    var parameter = parameters[parameterIndex];
                    // Current sequence actions use string references.
                    if (parameter.type != "string")
                        throw Invalid(location, $"The sequence compiler does not support parameter type '{parameter.type}'.");
                    literals[parameterIndex] = LuaString(RequiredString(arguments[parameter.name], location, parameter.name));
                }
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

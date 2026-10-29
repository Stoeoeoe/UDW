using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Text.RegularExpressions;
using MoonSharp.Interpreter;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json;
using UnityEngine;

namespace Core.Scripting
{
    [Serializable]
    public sealed class CutsceneVariableDefinition
    {
        [SerializeField] private string name, type, initialJson;
        [SerializeField] private bool nullable;
        public string Name => name;
        public string Type => type;
        public bool Nullable => nullable;
        public string InitialJson => initialJson;
        public CutsceneVariableDefinition(string name, string type, string initialJson, bool nullable = false)
        { this.name = name; this.type = type; this.initialJson = initialJson; this.nullable = nullable; }
    }

    /// <summary>Transient typed values shared by the setup, sequence, Lua nodes and completion of one run.</summary>
    public sealed class CutsceneVariables
    {
        private readonly Dictionary<string, CutsceneVariableDefinition> _definitions = new(StringComparer.Ordinal);
        private readonly Dictionary<string, DynValue> _values = new(StringComparer.Ordinal);
        private readonly Script _storage = new(CoreModules.Preset_HardSandbox);
        public CutsceneVariables(IEnumerable<CutsceneVariableDefinition> definitions)
        {
            foreach (var definition in definitions)
            {
                if (!Regex.IsMatch(definition.Name, "^[A-Za-z_][A-Za-z0-9_]*$") || !_definitions.TryAdd(definition.Name, definition))
                    throw new ArgumentException($"Invalid or duplicate cutscene variable '{definition.Name}'.");
                using var reader = new JsonTextReader(new StringReader(definition.InitialJson)) { DateParseHandling = DateParseHandling.None };
                var value = LuaValues.FromJson(JToken.ReadFrom(reader), _storage);
                LuaValues.RequireType(value, definition.Type, definition.Nullable);
                _values.Add(definition.Name, value);
            }
        }

        public CutsceneVariableDefinition Require(string name) => _definitions.TryGetValue(name, out var definition)
            ? definition : throw new InvalidOperationException($"Unknown cutscene variable '{name}'.");
        public DynValue Get(string name, Script script) { Require(name); return LuaValues.Copy(_values[name], script); }
        public void Set(string name, DynValue value) => Assign(new[] { name }, new[] { value });
        public void Assign(string[] names, DynValue[] values)
        {
            if (names.Length != values.Length) throw new InvalidOperationException("Cutscene result arity does not match its destinations.");
            var prepared = new Dictionary<string, DynValue>(StringComparer.Ordinal);
            for (var index = 0; index < names.Length; index++)
            {
                if (names[index] == null) continue; // An explicitly unassigned output is discarded.
                var definition = Require(names[index]);
                LuaValues.RequireType(values[index], definition.Type, definition.Nullable);
                if (!prepared.TryAdd(names[index], LuaValues.Copy(values[index], _storage)))
                    throw new InvalidOperationException($"Duplicate result destination '{names[index]}'.");
            }
            foreach (var pair in prepared) _values[pair.Key] = pair.Value;
        }

        internal void Bind(Script script, bool writable)
        {
            var cutscene = script.Globals.Get("Cutscene");
            if (cutscene.Type == DataType.Nil) { cutscene = DynValue.NewTable(script); script.Globals.Set("Cutscene", cutscene); }
            var proxy = new Table(script);
            proxy.MetaTable = new Table(script);
            proxy.MetaTable.Set("__metatable", DynValue.NewBoolean(false));
            proxy.MetaTable.Set("__index", DynValue.NewCallback((_, args) => Get(args[1].String, script)));
            proxy.MetaTable.Set("__newindex", DynValue.NewCallback((_, args) =>
            {
                if (!writable) throw new InvalidOperationException("Conditions cannot write cutscene variables.");
                Set(args[1].String, args[2]); return DynValue.Nil;
            }));
            var namespaceMeta = new Table(script);
            namespaceMeta.Set("__metatable", DynValue.False);
            namespaceMeta.Set("__index", DynValue.NewCallback((_, args) =>
                args[1].Type == DataType.String && args[1].String == "Variables" ? DynValue.NewTable(proxy) : DynValue.Nil));
            namespaceMeta.Set("__newindex", DynValue.NewCallback((_, args) =>
            {
                if (args[1].Type == DataType.String && args[1].String == "Variables")
                    throw new InvalidOperationException("Assign declared cutscene variables, not the Variables namespace.");
                args[0].Table.Set(args[1], args[2]); return DynValue.Nil;
            }));
            cutscene.Table.MetaTable = namespaceMeta;
            // Raw access would bypass the declared type and read-only condition contracts.
            script.Globals.Set("rawset", DynValue.Nil);
            script.Globals.Set("setmetatable", DynValue.Nil);
        }
    }

    /// <summary>An action's ordered Lua results. Scalars continue to use their ordinary C# return types.</summary>
    public sealed class LuaValues
    {
        public DynValue[] Values { get; }
        public LuaValues(params DynValue[] values) => Values = (DynValue[])values.Clone();
        public static string CanonicalType(string type) => type == "boolean|string|number|table" ? "storyValue" : type;
        public static bool Compatible(string source, bool sourceNullable, string target, bool targetNullable) =>
            (!sourceNullable || targetNullable) && (CanonicalType(source) == CanonicalType(target) ||
                CanonicalType(target) == "storyValue" && CanonicalType(source) is "boolean" or "number" or "string" or "table");
        public static void RequireType(DynValue value, string type, bool nullable = false)
        {
            if (value == null) throw new InvalidOperationException("A Lua value is required; use DynValue.Nil for nil.");
            if (CanonicalType(type) is not ("boolean" or "number" or "string" or "position" or "path" or "storyValue" or "table"))
                throw new InvalidOperationException($"Unsupported cutscene variable type '{type}'.");
            if (nullable && value.Type == DataType.Nil) return;
            switch (CanonicalType(type))
            {
                case "boolean" when value.Type == DataType.Boolean: return;
                case "number" when value.Type == DataType.Number && double.IsFinite(value.Number): return;
                case "string" when value.Type == DataType.String: return;
                case "position": LuaBindingRegistry.FromLua(value, typeof(MapPosition), "variable"); return;
                case "path": LuaBindingRegistry.FromLua(value, typeof(MapPath), "variable"); return;
                case "storyValue": StoryValueLuaConverter.Read(value); return;
                case "table" when value.Type == DataType.Table: RequireJsonValue(value, new HashSet<Table>()); return;
                default: throw new InvalidOperationException($"Expected cutscene value of type '{type}'{(nullable ? " or nil" : "")}, got {value.Type}.");
            }
        }
        private static void RequireJsonValue(DynValue value, HashSet<Table> path)
        {
            if (value.Type is DataType.Nil or DataType.Boolean or DataType.String) return;
            if (value.Type == DataType.Number && double.IsFinite(value.Number)) return;
            if (value.Type != DataType.Table || value.Table.MetaTable != null || !path.Add(value.Table))
                throw new InvalidOperationException("Cutscene tables require plain, acyclic Lua data.");
            foreach (var pair in value.Table.Pairs)
            {
                if (pair.Key.Type != DataType.String && (pair.Key.Type != DataType.Number || !double.IsFinite(pair.Key.Number)))
                    throw new InvalidOperationException("Cutscene table keys must be strings or finite numbers.");
                RequireJsonValue(pair.Value, path);
            }
            path.Remove(value.Table);
        }
        internal static DynValue Copy(DynValue value, Script script)
        {
            RequireJsonValue(value, new HashSet<Table>());
            if (value.Type != DataType.Table) return value;
            var table = new Table(script);
            foreach (var pair in value.Table.Pairs) table.Set(pair.Key, Copy(pair.Value, script));
            return DynValue.NewTable(table);
        }
        public static DynValue FromJson(JToken token, Script script)
        {
            if (token.Type == JTokenType.Null) return DynValue.Nil;
            if (token.Type == JTokenType.Boolean) return DynValue.NewBoolean((bool)token);
            if (token.Type == JTokenType.String) return DynValue.NewString((string)token);
            if (token.Type is JTokenType.Integer or JTokenType.Float) return DynValue.NewNumber((double)token);
            var table = new Table(script);
            if (token is JArray array)
                for (var index = 0; index < array.Count; index++) table.Set(index + 1, FromJson(array[index], script));
            else if (token is JObject obj)
                foreach (var property in obj.Properties()) table.Set(property.Name, FromJson(property.Value, script));
            else throw new InvalidOperationException("Expected JSON cutscene data.");
            return DynValue.NewTable(table);
        }
    }

    [AttributeUsage(AttributeTargets.Method, AllowMultiple = true)]
    public sealed class LuaOutputAttribute : Attribute
    {
        public string Name { get; }
        public string Type { get; }
        public bool Nullable { get; set; }
        public LuaOutputAttribute(string name, string type) { Name = name; Type = type; }
    }

    public interface ILuaResultAction : ILuaAction { LuaValues Results { get; } }
}

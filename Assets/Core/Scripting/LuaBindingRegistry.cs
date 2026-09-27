using System;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.ExceptionServices;
using MoonSharp.Interpreter;
using UnityEngine.Scripting;

namespace Core.Scripting
{
    [AttributeUsage(AttributeTargets.Class)]
    public sealed class LuaModuleAttribute : Attribute
    {
        public string Path { get; }
        public LuaModuleAttribute(string path) => Path = path;
    }

    // PreserveAttribute keeps reflection-only API members in stripped player builds.
    [AttributeUsage(AttributeTargets.Method)]
    public sealed class LuaCallAttribute : PreserveAttribute
    {
        public bool WritesState { get; }
        public LuaCallAttribute(bool writesState = false) => WritesState = writesState;
    }

    [AttributeUsage(AttributeTargets.Class)]
    public sealed class LuaTableAttribute : PreserveAttribute { }

    [AttributeUsage(AttributeTargets.Field)]
    public sealed class LuaFieldAttribute : PreserveAttribute { }

    /// <summary>Validates marked APIs once, then attaches their cached methods to each Lua Script.</summary>
    public sealed class LuaBindingRegistry
    {
        private readonly List<Module> _modules = new();
        private readonly Dictionary<Type, FieldInfo[]> _dtoFields = new();

        public LuaBindingRegistry(params object[] apiModules)
        {
            if (apiModules == null) throw new ArgumentNullException(nameof(apiModules));
            var paths = new HashSet<string>(StringComparer.Ordinal);
            foreach (var api in apiModules)
            {
                if (api == null) throw new ArgumentException("Lua API modules cannot be null.", nameof(apiModules));
                var type = api.GetType();
                var attribute = type.GetCustomAttribute<LuaModuleAttribute>();
                if (attribute == null)
                    throw new ArgumentException($"{type.Name} needs [LuaModule].", nameof(apiModules));

                var path = attribute.Path?.Split('.');
                if (path == null || path.Length == 0 || Array.Exists(path, string.IsNullOrWhiteSpace))
                    throw new ArgumentException($"{type.Name} has an invalid Lua module path.", nameof(apiModules));
                if (!paths.Add(attribute.Path))
                    throw new ArgumentException($"Duplicate Lua module path '{attribute.Path}'.", nameof(apiModules));

                var methods = new List<Method>();
                var names = new HashSet<string>(StringComparer.Ordinal);
                foreach (var method in type.GetMethods(BindingFlags.Instance | BindingFlags.Static |
                             BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly))
                {
                    var call = method.GetCustomAttribute<LuaCallAttribute>();
                    if (call == null) continue;
                    if (!method.IsPublic || method.IsStatic || method.IsGenericMethod || method.IsSpecialName)
                        throw Invalid(method, "must be a public instance method");
                    if (!names.Add(method.Name))
                        throw Invalid(method, "has an overloaded Lua name");

                    var parameters = method.GetParameters();
                    foreach (var parameter in parameters)
                    {
                        if (parameter.IsOut || parameter.ParameterType.IsByRef || parameter.IsOptional ||
                            parameter.GetCustomAttribute<ParamArrayAttribute>() != null ||
                            !IsPrimitive(parameter.ParameterType))
                            throw Invalid(method, $"has unsupported parameter '{parameter.Name}'");
                    }

                    if (method.ReturnType != typeof(void) && !IsPrimitive(method.ReturnType))
                        ValidateDto(method.ReturnType);
                    methods.Add(new Method(api, method, parameters, call.WritesState));
                }
                _modules.Add(new Module(path, methods));
            }
        }

        /// <summary>Returns the validated Lua surface in a stable order for tooling.</summary>
        public LuaBindingManifest Describe()
        {
            var modules = new List<LuaModuleDescription>();
            foreach (var module in _modules)
            {
                var methods = new List<LuaMethodDescription>();
                foreach (var method in module.Methods)
                {
                    var parameters = new LuaParameterDescription[method.Parameters.Length];
                    for (var i = 0; i < parameters.Length; i++)
                        parameters[i] = new LuaParameterDescription
                        {
                            name = method.Parameters[i].Name,
                            type = LuaTypeName(method.Parameters[i].ParameterType)
                        };

                    methods.Add(new LuaMethodDescription
                    {
                        name = method.Info.Name,
                        parameters = parameters,
                        returnType = LuaTypeName(method.Info.ReturnType),
                        returnNullable = !method.Info.ReturnType.IsValueType && method.Info.ReturnType != typeof(void),
                        writesState = method.WritesState
                    });
                }
                methods.Sort((a, b) => StringComparer.Ordinal.Compare(a.name, b.name));
                modules.Add(new LuaModuleDescription { path = string.Join(".", module.Path), methods = methods.ToArray() });
            }
            modules.Sort((a, b) => StringComparer.Ordinal.Compare(a.path, b.path));

            var tables = new List<LuaTableDescription>();
            foreach (var pair in _dtoFields)
            {
                var fields = new List<LuaParameterDescription>();
                foreach (var field in pair.Value)
                    fields.Add(new LuaParameterDescription { name = field.Name, type = LuaTypeName(field.FieldType) });
                fields.Sort((a, b) => StringComparer.Ordinal.Compare(a.name, b.name));
                tables.Add(new LuaTableDescription { name = pair.Key.Name, fields = fields.ToArray() });
            }
            tables.Sort((a, b) => StringComparer.Ordinal.Compare(a.name, b.name));
            return new LuaBindingManifest { modules = modules.ToArray(), tables = tables.ToArray() };
        }

        internal void Bind(Script script, bool allowWrites)
        {
            foreach (var module in _modules)
            {
                var table = EnsurePath(script, module.Path);
                foreach (var method in module.Methods)
                {
                    if (method.WritesState && !allowWrites) continue;
                    if (table.Get(method.Info.Name).Type != DataType.Nil)
                        throw new InvalidOperationException($"Duplicate Lua API member '{method.Info.Name}'.");
                    table.Set(method.Info.Name, DynValue.NewCallback((_, args) => Invoke(script, method, args)));
                }
            }
        }

        private DynValue Invoke(Script script, Method method, CallbackArguments args)
        {
            var parameters = method.Parameters;
            if (args.Count != parameters.Length)
                throw new ArgumentException($"{method.Info.Name} expects {parameters.Length} argument(s).");

            var values = new object[parameters.Length];
            for (var i = 0; i < values.Length; i++)
                values[i] = FromLua(args[i], parameters[i].ParameterType, parameters[i].Name);

            object result;
            try
            {
                result = method.Info.Invoke(method.Api, values);
            }
            catch (TargetInvocationException exception)
            {
                ExceptionDispatchInfo.Capture(exception.InnerException ?? exception).Throw();
                throw;
            }
            return ToLua(script, result, method.Info.ReturnType);
        }

        private void ValidateDto(Type type)
        {
            if (_dtoFields.ContainsKey(type)) return;
            if (!type.IsClass || type.GetCustomAttribute<LuaTableAttribute>() == null)
                throw new InvalidOperationException($"Lua return type {type.Name} must be primitive or marked [LuaTable].");

            var fields = new List<FieldInfo>();
            foreach (var field in type.GetFields(BindingFlags.Instance | BindingFlags.Static |
                         BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly))
            {
                if (field.GetCustomAttribute<LuaFieldAttribute>() == null) continue;
                if (!field.IsPublic || field.IsStatic || !IsPrimitive(field.FieldType))
                    throw new InvalidOperationException($"Lua DTO field {type.Name}.{field.Name} must be public, instance, and primitive.");
                fields.Add(field);
            }
            if (fields.Count == 0)
                throw new InvalidOperationException($"Lua DTO {type.Name} has no [LuaField] fields.");
            _dtoFields.Add(type, fields.ToArray());
        }

        private DynValue ToLua(Script script, object value, Type type)
        {
            if (type == typeof(void) || value == null) return DynValue.Nil;
            if (type == typeof(string)) return DynValue.NewString((string)value);
            if (type == typeof(bool)) return DynValue.NewBoolean((bool)value);
            if (type == typeof(int)) return DynValue.NewNumber((int)value);
            if (type == typeof(double)) return DynValue.NewNumber((double)value);

            var table = new Table(script);
            foreach (var field in _dtoFields[type])
                table.Set(field.Name, ToLua(script, field.GetValue(value), field.FieldType));
            return DynValue.NewTable(table);
        }

        private static object FromLua(DynValue value, Type type, string parameter)
        {
            if (type == typeof(string) && value.Type == DataType.String && !string.IsNullOrWhiteSpace(value.String))
                return value.String;
            if (type == typeof(bool) && value.Type == DataType.Boolean)
                return value.Boolean;
            if (value.Type == DataType.Number && !double.IsNaN(value.Number) && !double.IsInfinity(value.Number))
            {
                if (type == typeof(double)) return value.Number;
                if (type == typeof(int) && value.Number == Math.Truncate(value.Number) &&
                    value.Number >= int.MinValue && value.Number <= int.MaxValue)
                    return (int)value.Number;
            }
            throw new ArgumentException($"{parameter} must be a valid {type.Name}.");
        }

        private static Table EnsurePath(Script script, string[] path)
        {
            var table = script.Globals;
            foreach (var part in path)
            {
                var value = table.Get(part);
                if (value.Type == DataType.Nil)
                {
                    var child = new Table(script);
                    table.Set(part, DynValue.NewTable(child));
                    table = child;
                }
                else if (value.Type == DataType.Table)
                    table = value.Table;
                else
                    throw new InvalidOperationException($"Lua API path '{part}' conflicts with an existing value.");
            }
            return table;
        }

        private static bool IsPrimitive(Type type) => type == typeof(string) || type == typeof(bool) ||
            type == typeof(int) || type == typeof(double);

        private static string LuaTypeName(Type type)
        {
            if (type == typeof(void)) return "nil";
            if (type == typeof(string)) return "string";
            if (type == typeof(bool)) return "boolean";
            if (type == typeof(int)) return "integer";
            if (type == typeof(double)) return "number";
            return type.Name; // [LuaTable] types were validated during registration.
        }

        private static InvalidOperationException Invalid(MethodInfo method, string reason) =>
            new($"Lua method {method.DeclaringType?.Name}.{method.Name} {reason}.");

        private sealed class Module
        {
            public readonly string[] Path;
            public readonly List<Method> Methods;
            public Module(string[] path, List<Method> methods) { Path = path; Methods = methods; }
        }

        private sealed class Method
        {
            public readonly object Api;
            public readonly MethodInfo Info;
            public readonly ParameterInfo[] Parameters;
            public readonly bool WritesState;
            public Method(object api, MethodInfo info, ParameterInfo[] parameters, bool writesState)
            { Api = api; Info = info; Parameters = parameters; WritesState = writesState; }
        }
    }
}

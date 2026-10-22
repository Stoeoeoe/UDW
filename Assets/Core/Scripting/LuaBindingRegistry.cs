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

    /// <summary>Marks a public instance method as part of its module's validated Lua API.</summary>
    /// <remarks>
    /// On its own, this exposes an ordinary synchronous call through
    /// <see cref="VulcanusLuaEngine.Execute"/> and, when read-only, condition evaluation.
    /// It does not expose a visual editor action. Add <see cref="LuaActionAttribute"/>
    /// to opt into session execution and visual-action metadata; such methods are then
    /// excluded from the synchronous binding path.
    /// Inheriting PreserveAttribute keeps reflection-only methods in stripped player builds.
    /// </remarks>
    [AttributeUsage(AttributeTargets.Method)]
    public sealed class LuaCallAttribute : PreserveAttribute
    {
        /// <summary>Excludes an ordinary mutating call from read-only condition environments.</summary>
        /// <remarks>Session actions are permitted by LuaAction contexts instead; this flag is not a session capability grant.</remarks>
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
            var actionIds = new HashSet<string>(StringComparer.Ordinal);
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
                    var action = method.GetCustomAttribute<LuaActionAttribute>();
                    if (call == null)
                    {
                        if (action != null) throw Invalid(method, "needs [LuaCall] for [LuaAction]");
                        continue;
                    }
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

                    if (action != null)
                    {
                        if (string.IsNullOrWhiteSpace(action.Id) || !actionIds.Add(action.Id) ||
                            string.IsNullOrWhiteSpace(action.DisplayName) || string.IsNullOrWhiteSpace(action.Category) ||
                            string.IsNullOrWhiteSpace(action.Description) || action.Contexts.Length == 0)
                            throw Invalid(method, "has invalid or duplicate action metadata");
                        var contexts = new HashSet<string>(StringComparer.Ordinal);
                        foreach (var context in action.Contexts)
                            if ((context != "cutscene" && context != "npcRoutine") || !contexts.Add(context))
                                throw Invalid(method, "has unsupported or duplicate execution contexts");
                        foreach (var parameter in parameters)
                        {
                            var reference = parameter.GetCustomAttribute<LuaReferenceAttribute>();
                            if (reference != null && (parameter.ParameterType != typeof(string) ||
                                !((reference.Type == "actorRef" && reference.Picker == "mapActor") ||
                                  (reference.Type == "anchorRef" && reference.Picker == "mapAnchor") ||
                                  (reference.Type == "dialogueRef" && reference.Picker == "dialogue"))))
                                throw Invalid(method, "has unsupported semantic reference metadata");
                        }
                    }
                    if (method.ReturnType == typeof(ILuaAction) && action == null)
                        throw Invalid(method, "must opt in to [LuaAction] to return an awaitable");
                    if (method.ReturnType != typeof(void) && method.ReturnType != typeof(ILuaAction) && !IsPrimitive(method.ReturnType))
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
                            type = LuaTypeName(method.Parameters[i].ParameterType),
                            semanticType = method.Parameters[i].GetCustomAttribute<LuaReferenceAttribute>()?.Type,
                            picker = method.Parameters[i].GetCustomAttribute<LuaReferenceAttribute>()?.Picker
                        };

                    var action = method.Info.GetCustomAttribute<LuaActionAttribute>();
                    methods.Add(new LuaMethodDescription
                    {
                        name = method.Info.Name,
                        parameters = parameters,
                        returnType = LuaTypeName(method.Info.ReturnType),
                        returnNullable = !method.Info.ReturnType.IsValueType && method.Info.ReturnType != typeof(void) &&
                            method.Info.ReturnType != typeof(ILuaAction),
                        writesState = method.WritesState,
                        action = action == null ? null : new LuaActionDescription
                        {
                            id = action.Id, displayName = action.DisplayName, category = action.Category,
                            description = action.Description, contexts = Sorted(action.Contexts),
                            execution = method.Info.ReturnType == typeof(ILuaAction) ? "awaitable" : "immediate"
                        }
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
                    if (method.Info.GetCustomAttribute<LuaActionAttribute>() != null) continue;
                    if (method.WritesState && !allowWrites) continue;
                    if (table.Get(method.Info.Name).Type != DataType.Nil)
                        throw new InvalidOperationException($"Duplicate Lua API member '{method.Info.Name}'.");
                    table.Set(method.Info.Name, DynValue.NewCallback((_, args) => Invoke(script, method, args)));
                }
            }
        }

        internal void BindActions(Script script, string context, Func<ILuaAction, DynValue> awaitAction)
        {
            if (context != "cutscene" && context != "npcRoutine") throw new ArgumentException("Unsupported Lua execution context.", nameof(context));
            foreach (var module in _modules)
            foreach (var method in module.Methods)
            {
                var action = method.Info.GetCustomAttribute<LuaActionAttribute>();
                if (action == null || Array.IndexOf(action.Contexts, context) < 0) continue;
                var table = EnsurePath(script, module.Path);
                table.Set(method.Info.Name, DynValue.NewCallback((_, args) => Invoke(script, method, args, awaitAction)));
            }
        }

        private static string[] Sorted(string[] values)
        {
            var copy = (string[])values.Clone();
            Array.Sort(copy, StringComparer.Ordinal);
            return copy;
        }

        private DynValue Invoke(Script script, Method method, CallbackArguments args, Func<ILuaAction, DynValue> awaitAction = null)
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
            return method.Info.ReturnType == typeof(ILuaAction)
                ? awaitAction((ILuaAction)result) : ToLua(script, result, method.Info.ReturnType);
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
            if (type == typeof(ILuaAction)) return "nil"; // Host operation is never exposed as Lua userdata.
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

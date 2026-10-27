using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.ExceptionServices;
using MoonSharp.Interpreter;
using UnityEngine.Scripting;

namespace Core.Scripting
{
    /// <summary>Validates marked APIs once, then attaches their cached methods to each Lua Script.</summary>
    /// <remarks>
    /// Registration checks the C# contract. Describe exports that same contract for tooling.
    /// Bind and BindActions expose it to a Lua script; Invoke checks values arriving from Lua.
    /// </remarks>
    public sealed class LuaBindingRegistry
    {
        private readonly List<Module> _modules = new();
        private readonly Dictionary<Type, FieldInfo[]> _dtoFields = new();

        public LuaBindingRegistry(params object[] apiModules) : this(
            (apiModules ?? throw new ArgumentNullException(nameof(apiModules))).Select(api =>
                (api?.GetType() ?? throw new ArgumentException("Lua API modules cannot be null.", nameof(apiModules)), api)).ToArray()) { }

        /// <summary>Describes API types without creating them, so editor export needs no running game.</summary>
        public static LuaBindingManifest DescribeTypes(params Type[] apiTypes) => InspectTypes(apiTypes).Describe();

        // Type-only inspection deliberately has no API instances: export and sequence
        // preparation need validated signatures before scene services are constructed.
        internal static LuaBindingRegistry InspectTypes(params Type[] apiTypes)
        {
            if (apiTypes == null) throw new ArgumentNullException(nameof(apiTypes));
            return new LuaBindingRegistry(apiTypes.Select(type =>
                (type ?? throw new ArgumentException("Lua API types cannot be null.", nameof(apiTypes)), (object)null)).ToArray());
        }

        // Runtime registration and editor export share all signature and metadata checks.
        private LuaBindingRegistry((Type Type, object Api)[] apiModules)
        {
            var paths = new HashSet<string>(StringComparer.Ordinal);
            var actionIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var (type, api) in apiModules)
            {
                var attribute = type.GetCustomAttribute<LuaModuleAttribute>();
                if (attribute == null)
                    throw new ArgumentException($"{type.Name} needs [LuaModule].", nameof(apiModules));

                var path = attribute.Path?.Split('.');
                if (path == null || Array.Exists(path, string.IsNullOrWhiteSpace))
                    throw new ArgumentException($"{type.Name} has an invalid Lua module path.", nameof(apiModules));
                if (!paths.Add(attribute.Path))
                    throw new ArgumentException($"Duplicate Lua module path '{attribute.Path}'.", nameof(apiModules));

                _modules.Add(new Module(path, ReadMethods(type, api, actionIds)));
            }
        }

        private List<Method> ReadMethods(Type type, object api, HashSet<string> actionIds)
        {
            var methods = new List<Method>();
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var method in type.GetMethods(BindingFlags.Instance | BindingFlags.Static |
                         BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly))
            {
                var call = method.GetCustomAttribute<LuaCallAttribute>();
                var action = method.GetCustomAttribute<LuaActionAttribute>();
                var preview = method.GetCustomAttribute<LuaPreviewAttribute>();
                var effects = method.GetCustomAttributes<LuaPreviewEffectAttribute>().ToArray();
                if (action == null && (preview != null || effects.Length > 0))
                    throw Invalid(method, "preview metadata requires [LuaAction]");
                if (call == null && action == null) continue;
                if (!method.IsPublic || method.IsStatic || method.IsGenericMethod || method.IsSpecialName)
                    throw Invalid(method, "must be a public instance method");
                if (!names.Add(method.Name))
                    throw Invalid(method, "has an overloaded Lua name");

                var parameters = method.GetParameters();
                foreach (var parameter in parameters)
                {
                    if ((parameter.IsOptional && (!IsPrimitive(parameter.ParameterType) || parameter.DefaultValue == null)) || (!IsPrimitive(parameter.ParameterType) && parameter.ParameterType != typeof(MapPosition) && parameter.ParameterType != typeof(MapPosition?) && parameter.ParameterType != typeof(MapPath)))
                        throw Invalid(method, $"has unsupported parameter '{parameter.Name}'");
                    var position = parameter.GetCustomAttribute<LuaPositionAttribute>();
                    var path = parameter.GetCustomAttribute<LuaPathAttribute>();
                    if ((parameter.ParameterType == typeof(MapPath)) != (path != null))
                        throw Invalid(method, $"path parameter '{parameter.Name}' requires MapPath and [LuaPath] together");
                    if ((parameter.ParameterType == typeof(MapPosition) || parameter.ParameterType == typeof(MapPosition?)) != (position != null))
                        throw Invalid(method, $"position parameter '{parameter.Name}' requires MapPosition and [LuaPosition] together");
                    if ((position != null || path != null) && (parameter.GetCustomAttribute<LuaReferenceAttribute>() != null ||
                        parameter.GetCustomAttribute<LuaResourceAttribute>() != null))
                        throw Invalid(method, $"position parameter '{parameter.Name}' cannot also declare reference/resource metadata");
                }

                if (action != null) ValidateAction(method, action, parameters, actionIds);
                if (method.ReturnType == typeof(ILuaAction) && action == null)
                    throw Invalid(method, "must opt in to [LuaAction] to return an awaitable");
                if (method.ReturnType != typeof(void) && method.ReturnType != typeof(ILuaAction) && !IsPrimitive(method.ReturnType))
                    ValidateDto(method.ReturnType);
                methods.Add(new Method(api, method, parameters, action != null || call.WritesState, action,
                    FindValidator(method, action, parameters), ReadPreview(method, parameters, preview, effects)));
            }
            return methods;
        }

        private static LuaActionPreviewDescription ReadPreview(MethodInfo method, ParameterInfo[] parameters,
            LuaPreviewAttribute preview, LuaPreviewEffectAttribute[] effects)
        {
            if (preview == null)
            {
                if (effects.Length > 0) throw Invalid(method, "preview effects require [LuaPreview]");
                return null; // No declaration means unavailable, not a spatial no-op.
            }
            if (preview.Version is not (1 or 2)) throw Invalid(method, $"has unsupported preview version {preview.Version}");
            var spatialState = preview.SpatialState switch
            {
                LuaPreviewSpatialState.Described => "described",
                LuaPreviewSpatialState.Unknown => "unknown",
                _ => throw Invalid(method, "has unsupported preview spatial state")
            };
            var orders = new HashSet<int>();
            var descriptions = new List<LuaPreviewEffectDescription>();
            foreach (var effect in effects.OrderBy(effect => effect.Order))
            {
                if (effect.Order < 0 || !orders.Add(effect.Order))
                    throw Invalid(method, "preview effect order must be nonnegative and unique");
                if (effect.PathParameter != null && effect.Kind != LuaPreviewEffectKind.MoveCharacterAlongPath)
                    throw Invalid(method, "only moveCharacterAlongPath permits pathParameter");
                string kind;
                switch (effect.Kind)
                {
                    case LuaPreviewEffectKind.MoveCharacterAlongPath:
                        if (preview.Version != 2) throw Invalid(method, "moveCharacterAlongPath requires preview version 2");
                        RequireParameter(effect.CharacterParameter, "characterRef", "mapCharacter");
                        var path = parameters.SingleOrDefault(parameter => parameter.Name == effect.PathParameter);
                        if (path == null || path.ParameterType != typeof(MapPath) || path.GetCustomAttribute<LuaPathAttribute>() == null)
                            throw Invalid(method, "preview requires a pathParameter declared with [LuaPath]");
                        if (effect.DefinitionParameter != null || effect.AnchorParameter != null || effect.TargetCharacterParameter != null ||
                            effect.DialogueParameter != null || effect.DirectionParameter != null || effect.PositionParameter != null || effect.Facing != "unknown")
                            throw Invalid(method, "moveCharacterAlongPath requires facing 'unknown' and forbids definition/anchor/target/dialogue/direction/position fields");
                        kind = "moveCharacterAlongPath";
                        break;
                    case LuaPreviewEffectKind.MoveCharacterToAnchor:
                        RequireParameter(effect.CharacterParameter, "characterRef", "mapCharacter");
                        RequireParameter(effect.AnchorParameter, "anchorRef", "mapAnchor");
                        if (effect.DefinitionParameter != null || effect.TargetCharacterParameter != null || effect.DialogueParameter != null || effect.DirectionParameter != null || effect.PositionParameter != null || effect.Facing != "unknown")
                            throw Invalid(method, "moveCharacterToAnchor preview requires facing 'unknown' and forbids targetCharacterParameter/dialogueParameter/directionParameter");
                        kind = "moveCharacterToAnchor";
                        break;
                    case LuaPreviewEffectKind.FaceCharacterTowardCharacter:
                        RequireParameter(effect.CharacterParameter, "characterRef", "mapCharacter");
                        RequireParameter(effect.TargetCharacterParameter, "characterRef", "mapCharacter");
                        if (effect.DefinitionParameter != null || effect.AnchorParameter != null || effect.DialogueParameter != null || effect.DirectionParameter != null || effect.PositionParameter != null || effect.Facing != null)
                            throw Invalid(method, "faceCharacterTowardCharacter preview forbids anchorParameter/dialogueParameter/directionParameter/facing");
                        kind = "faceCharacterTowardCharacter";
                        break;
                    case LuaPreviewEffectKind.ShowDialogue:
                        RequireParameter(effect.DialogueParameter, "dialogueRef", "dialogue");
                        if (effect.DefinitionParameter != null || effect.CharacterParameter != null || effect.AnchorParameter != null || effect.TargetCharacterParameter != null || effect.DirectionParameter != null || effect.PositionParameter != null || effect.Facing != null)
                            throw Invalid(method, "showDialogue preview forbids characterParameter/anchorParameter/targetCharacterParameter/directionParameter/facing");
                        kind = "showDialogue";
                        break;
                    case LuaPreviewEffectKind.FaceCharacterDirection:
                        RequireParameter(effect.CharacterParameter, "characterRef", "mapCharacter");
                        var direction = parameters.SingleOrDefault(parameter => parameter.Name == effect.DirectionParameter);
                        if (direction == null || direction.ParameterType != typeof(string) ||
                            direction.GetCustomAttribute<LuaResourceAttribute>()?.Type != "direction")
                            throw Invalid(method, "faceCharacterDirection preview requires a string directionParameter with resource type 'direction'");
                        if (effect.DefinitionParameter != null || effect.AnchorParameter != null || effect.TargetCharacterParameter != null || effect.DialogueParameter != null || effect.PositionParameter != null || effect.Facing != null)
                            throw Invalid(method, "faceCharacterDirection preview forbids anchorParameter/targetCharacterParameter/dialogueParameter/facing");
                        kind = "faceCharacterDirection";
                        break;
                    case LuaPreviewEffectKind.SetCharacterPosition:
                        if (preview.Version != 2) throw Invalid(method, "setCharacterPosition requires preview version 2");
                        RequireParameter(effect.CharacterParameter, "characterRef", "mapCharacter");
                        RequirePosition(effect.PositionParameter);
                        if (effect.DefinitionParameter != null || effect.AnchorParameter != null || effect.TargetCharacterParameter != null || effect.DialogueParameter != null ||
                            effect.DirectionParameter != null || effect.Facing != "preserve")
                            throw Invalid(method, "setCharacterPosition requires facing 'preserve' and forbids anchor/target/dialogue/direction fields");
                        kind = "setCharacterPosition";
                        break;
                    case LuaPreviewEffectKind.SpawnCharacter:
                        if (preview.Version != 2) throw Invalid(method, "spawnCharacter requires preview version 2");
                        var declaration = parameters.SingleOrDefault(parameter => parameter.Name == effect.CharacterParameter);
                        if (declaration?.GetCustomAttribute<LuaCharacterDeclarationAttribute>() == null)
                            throw Invalid(method, "spawnCharacter requires a characterParameter marked [LuaCharacterDeclaration]");
                        var definition = parameters.SingleOrDefault(parameter => parameter.Name == effect.DefinitionParameter);
                        if (definition?.GetCustomAttribute<LuaResourceAttribute>()?.Type != "character")
                            throw Invalid(method, "spawnCharacter requires a definitionParameter with character resource type");
                        RequirePosition(effect.PositionParameter);
                        if (effect.AnchorParameter != null || effect.TargetCharacterParameter != null || effect.DialogueParameter != null ||
                            effect.DirectionParameter != null || effect.Facing != "unknown")
                            throw Invalid(method, "spawnCharacter requires facing 'unknown' and forbids anchor/target/dialogue/direction fields");
                        kind = "spawnCharacter";
                        break;
                    default: throw Invalid(method, "has unsupported preview effect kind");
                }
                descriptions.Add(new LuaPreviewEffectDescription
                {
                    kind = kind, characterParameter = effect.CharacterParameter, anchorParameter = effect.AnchorParameter,
                    targetCharacterParameter = effect.TargetCharacterParameter, dialogueParameter = effect.DialogueParameter,
                    facing = effect.Facing, directionParameter = effect.DirectionParameter, positionParameter = effect.PositionParameter,
                    definitionParameter = effect.DefinitionParameter, pathParameter = effect.PathParameter
                });
            }
            return new LuaActionPreviewDescription { version = preview.Version, spatialState = spatialState, effects = descriptions.ToArray() };

            void RequireParameter(string name, string semanticType, string picker)
            {
                var parameter = parameters.SingleOrDefault(parameter => parameter.Name == name);
                var reference = parameter?.GetCustomAttribute<LuaReferenceAttribute>();
                if (string.IsNullOrWhiteSpace(name) || parameter == null || parameter.ParameterType != typeof(string) ||
                    reference == null || reference.Type != semanticType || reference.Picker != picker)
                    throw Invalid(method, $"preview parameter '{name}' requires a declared string parameter with {semanticType}/{picker}");
            }

            void RequirePosition(string name)
            {
                var point = parameters.SingleOrDefault(parameter => parameter.Name == name);
                if (point == null || point.ParameterType != typeof(MapPosition) || point.GetCustomAttribute<LuaPositionAttribute>() == null)
                    throw Invalid(method, "preview requires a positionParameter declared with [LuaPosition]");
            }
        }

        // These checks are shared by runtime registration and editor export. Neither
        // path should publish an API whose signatures or authoring metadata are invalid.
        private static void ValidateAction(MethodInfo method, LuaActionAttribute action,
            ParameterInfo[] parameters, HashSet<string> actionIds)
        {
            if (string.IsNullOrWhiteSpace(action.Id) || !actionIds.Add(action.Id) ||
                string.IsNullOrWhiteSpace(action.DisplayName) || string.IsNullOrWhiteSpace(action.Category) ||
                string.IsNullOrWhiteSpace(action.Description) || action.Contexts.Length == 0)
                throw Invalid(method, "has invalid or duplicate action metadata");
            var contexts = new HashSet<string>(StringComparer.Ordinal);
            foreach (var context in action.Contexts)
                if (context is not ("cutscene" or "npcRoutine") || !contexts.Add(context))
                    throw Invalid(method, "has unsupported or duplicate execution contexts");
            if (action.Phases == null || action.Phases.Length == 0)
                throw Invalid(method, "needs explicit action phases");
            var phases = new HashSet<string>(StringComparer.Ordinal);
            foreach (var phase in action.Phases)
                if (phase is not ("setup" or "sequence" or "completion") || !phases.Add(phase))
                    throw Invalid(method, "has unsupported or duplicate action phases");
            if (method.ReturnType == typeof(ILuaAction) && phases.Any(phase => phase != "sequence"))
                throw Invalid(method, "awaitable actions cannot allow setup or completion phases");
            foreach (var parameter in parameters)
            {
                var reference = parameter.GetCustomAttribute<LuaReferenceAttribute>();
                if (reference != null && (parameter.ParameterType != typeof(string) ||
                    (reference.Type, reference.Picker) is not
                        (("characterRef", "mapCharacter") or ("anchorRef", "mapAnchor") or ("dialogueRef", "dialogue"))))
                    throw Invalid(method, "has unsupported semantic reference metadata");
                var resource = parameter.GetCustomAttribute<LuaResourceAttribute>();
                if (parameter.GetCustomAttribute<LuaCodeAttribute>() != null &&
                    (parameter.ParameterType != typeof(string) || reference != null || resource != null ||
                     parameter.GetCustomAttribute<LuaCharacterDeclarationAttribute>() != null ||
                     parameter.GetCustomAttribute<LuaPositionAttribute>() != null ||
                     parameter.GetCustomAttribute<LuaPathAttribute>() != null))
                    throw Invalid(method, "Lua code requires a string without other pickers");
                if (resource != null && (parameter.ParameterType != typeof(string) ||
                    string.IsNullOrWhiteSpace(resource.Type) || reference != null))
                    throw Invalid(method, "resource parameters must be string IDs with a named resource type and no scene reference picker");
                if (parameter.GetCustomAttribute<LuaCharacterDeclarationAttribute>() != null &&
                    (parameter.ParameterType != typeof(string) || reference != null || resource != null ||
                     !phases.SetEquals(new[] { "setup" }) || !contexts.SetEquals(new[] { "cutscene" })))
                    throw Invalid(method, "character declarations require a string on a cutscene-only setup action, without reference/resource pickers");
            }
        }

        /// <summary>Returns the validated Lua surface in a stable order for tooling.</summary>
        public LuaBindingManifest Describe() => new()
        {
            // Stable ordering keeps generated files and importer dependency hashes unchanged
            // when reflection happens to enumerate the same API in a different order.
            modules = _modules.Select(module => new LuaModuleDescription
            {
                path = string.Join(".", module.Path),
                methods = module.Methods.Select(DescribeMethod).OrderBy(method => method.name, StringComparer.Ordinal).ToArray()
            }).OrderBy(module => module.path, StringComparer.Ordinal).ToArray(),
            tables = _dtoFields.Select(pair => new LuaTableDescription
            {
                name = pair.Key.Name,
                fields = pair.Value.Select(field => new LuaParameterDescription { name = field.Name, type = LuaTypeName(field.FieldType) })
                    .OrderBy(field => field.name, StringComparer.Ordinal).ToArray()
            }).OrderBy(table => table.name, StringComparer.Ordinal).ToArray()
        };

        private static LuaMethodDescription DescribeMethod(Method method)
        {
            var action = method.Action;
            return new LuaMethodDescription
            {
                name = method.Info.Name,
                parameters = method.Parameters.Select(DescribeParameter).ToArray(),
                returnType = LuaTypeName(method.Info.ReturnType),
                returnNullable = !method.Info.ReturnType.IsValueType && method.Info.ReturnType != typeof(ILuaAction),
                writesState = method.WritesState,
                action = action == null ? null : new LuaActionDescription
                {
                    id = action.Id, displayName = action.DisplayName,
                    category = action.Category, description = action.Description,
                    contexts = action.Contexts.OrderBy(context => context, StringComparer.Ordinal).ToArray(),
                    phases = action.Phases.OrderBy(phase => phase, StringComparer.Ordinal).ToArray(),
                    execution = method.Info.ReturnType == typeof(ILuaAction) ? "awaitable" : "immediate",
                    preview = method.Preview
                }
            };
        }

        private static LuaParameterDescription DescribeParameter(ParameterInfo parameter)
        {
            var reference = parameter.GetCustomAttribute<LuaReferenceAttribute>();
            var path = parameter.GetCustomAttribute<LuaPathAttribute>() != null;
            var position = path || parameter.GetCustomAttribute<LuaPositionAttribute>() != null;
            var code = parameter.GetCustomAttribute<LuaCodeAttribute>() != null;
            return new LuaParameterDescription
            {
                name = parameter.Name, type = LuaTypeName(parameter.ParameterType),
                nullable = parameter.ParameterType == typeof(MapPosition?) ? true : null,
                optional = parameter.IsOptional ? true : null,
                defaultValue = parameter.IsOptional ? parameter.DefaultValue : null,
                semanticType = code ? "lua" : parameter.GetCustomAttribute<LuaCharacterDeclarationAttribute>() != null ? "characterDeclaration" : reference?.Type,
                picker = code ? "lua" : path ? "mapPath" : position ? "mapPosition" : reference?.Picker,
                resourceType = parameter.GetCustomAttribute<LuaResourceAttribute>()?.Type,
                coordinateSpace = position ? "mapPixels" : null, origin = position ? "topLeft" : null,
                placementModes = position ? new[] { "tile", "pixel", "anchor" } : null,
                tileAnchor = position ? "center" : null, characterPivot = position ? "feet" : null
            };
        }

        internal IEnumerable<Method> GetActions() =>
            _modules.SelectMany(module => module.Methods).Where(method => method.Action != null);

        internal void Bind(Script script, bool allowWrites)
        {
            foreach (var module in _modules)
            {
                var table = EnsurePath(script, module.Path);
                foreach (var method in module.Methods)
                {
                    if (method.Action != null || (method.WritesState && !allowWrites)) continue;
                    if (table.Get(method.Info.Name).Type != DataType.Nil)
                        throw new InvalidOperationException($"Duplicate Lua API member '{method.Info.Name}'.");
                    table.Set(method.Info.Name, DynValue.NewCallback((_, args) => Invoke(script, method, args)));
                }
            }
        }

        internal void BindActions(Script script, string context, string phase, Func<ILuaAction, DynValue> awaitAction, Action actionStarting)
        {
            if (context is not ("cutscene" or "npcRoutine")) throw new ArgumentException("Unsupported Lua execution context.", nameof(context));
            if (phase is not ("setup" or "sequence" or "completion")) throw new ArgumentException("Unsupported Lua action phase.", nameof(phase));
            foreach (var module in _modules)
            foreach (var method in module.Methods)
            {
                if (method.Action == null || !method.Action.Contexts.Contains(context) || !method.Action.Phases.Contains(phase)) continue;
                var table = EnsurePath(script, module.Path);
                table.Set(method.Info.Name, DynValue.NewCallback((_, args) =>
                {
                    actionStarting();
                    return Invoke(script, method, args, awaitAction);
                }));
            }
        }

        private DynValue Invoke(Script script, Method method, CallbackArguments args, Func<ILuaAction, DynValue> awaitAction = null)
        {
            var parameters = method.Parameters;
            if (args.Count > parameters.Length || args.Count < parameters.Count(parameter => !parameter.IsOptional))
                throw new ArgumentException($"{method.Info.Name} expects {parameters.Length} argument(s).");

            var values = parameters.Select((parameter, index) => index < args.Count
                ? FromLua(args[index], parameter.ParameterType, parameter.Name) : parameter.DefaultValue).ToArray();
            var result = InvokeReflected(method.Info, method.Api, values);
            return method.Info.ReturnType == typeof(ILuaAction)
                ? awaitAction((ILuaAction)result) : ToLua(script, result, method.Info.ReturnType);
        }

        internal static object InvokeReflected(MethodInfo method, object api, object[] values)
        {
            try
            {
                return method.Invoke(api, values);
            }
            catch (TargetInvocationException exception)
            {
                // Reflection wraps the gameplay error. Keep its original stack and message
                // so sequence diagnostics report the failing validator or action.
                ExceptionDispatchInfo.Capture(exception.InnerException).Throw();
                throw;
            }
        }

        /// <summary>Runs a pure static action validator during authoring; scene checks wait for binding.</summary>
        public void ValidateAuthoredActionArguments(string actionId, object[] arguments)
        {
            var action = GetActions().Single(method => method.Action.Id == actionId);
            if (action.Validator != null && action.Validator.IsStatic)
                InvokeReflected(action.Validator, null, arguments);
        }

        private static MethodInfo FindValidator(MethodInfo method, LuaActionAttribute action, ParameterInfo[] parameters)
        {
            if (action == null) return null;
            if (action.Validator == null)
            {
                if (parameters.Any(parameter => parameter.GetCustomAttribute<LuaReferenceAttribute>() != null ||
                    parameter.GetCustomAttribute<LuaResourceAttribute>() != null || parameter.GetCustomAttribute<LuaPositionAttribute>() != null || parameter.GetCustomAttribute<LuaPathAttribute>() != null ||
                    parameter.GetCustomAttribute<LuaCharacterDeclarationAttribute>() != null || parameter.GetCustomAttribute<LuaCodeAttribute>() != null))
                    throw Invalid(method, "needs a Validator to check its reference/resource arguments before playback");
                return null; // Actions without references may have nothing to check before playback.
            }
            var candidates = method.DeclaringType.GetMethods(BindingFlags.Public | BindingFlags.NonPublic |
                BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
                .Where(candidate => candidate.Name == action.Validator).ToArray();
            if (candidates.Length != 1)
                throw Invalid(method, $"needs one validation method named '{action.Validator}'");
            var validator = candidates[0];
            if (validator.IsGenericMethod || validator.ReturnType != typeof(void) ||
                !validator.GetParameters().Select(parameter => parameter.ParameterType).SequenceEqual(parameters.Select(parameter => parameter.ParameterType)) ||
                validator.GetCustomAttribute<PreserveAttribute>() == null ||
                validator.GetCustomAttribute<LuaCallAttribute>() != null || validator.GetCustomAttribute<LuaActionAttribute>() != null)
                throw Invalid(method, $"validator '{action.Validator}' must be a void method with the same parameter types, marked [Preserve] and not exposed to Lua");
            return validator;
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
            if (value == null) return DynValue.Nil;
            if (type == typeof(string)) return DynValue.NewString((string)value);
            if (type == typeof(bool)) return DynValue.NewBoolean((bool)value);
            if (type == typeof(int)) return DynValue.NewNumber((int)value);
            if (type == typeof(double)) return DynValue.NewNumber((double)value);

            // Lua receives a snapshot, never a reference that could mutate the C# state.
            var table = new Table(script);
            foreach (var field in _dtoFields[type])
                table.Set(field.Name, ToLua(script, field.GetValue(value), field.FieldType));
            return DynValue.NewTable(table);
        }

        private static object FromLua(DynValue value, Type type, string parameter)
        {
            if (type == typeof(MapPosition?))
                return value.Type == DataType.Nil ? null : FromLua(value, typeof(MapPosition), parameter);
            if (type == typeof(MapPath))
            {
                if (value.Type != DataType.Table || value.Table.MetaTable != null || value.Table.Length == 0 ||
                    value.Table.Pairs.Any(pair => pair.Key.Type != DataType.Number || pair.Key.Number != Math.Truncate(pair.Key.Number) ||
                        pair.Key.Number < 1 || pair.Key.Number > value.Table.Length))
                    throw new ArgumentException($"{parameter} must be a nonempty, contiguous list of positions.");
                var points = new MapPosition[value.Table.Length];
                for (var i = 0; i < points.Length; i++)
                    points[i] = (MapPosition)FromLua(value.Table.Get(i + 1), typeof(MapPosition), $"{parameter}[{i + 1}]");
                return new MapPath(points);
            }
            if (type == typeof(MapPosition))
            {
                if (value.Type == DataType.Table && value.Table.MetaTable == null && value.Table.Get("anchor").Type != DataType.Nil)
                {
                    if (value.Table.Get("anchor").Type != DataType.String || value.Table.Pairs.Any(pair =>
                        pair.Key.Type != DataType.String || pair.Key.String != "anchor"))
                        throw new ArgumentException($"{parameter} must contain only a nonempty anchor ID.");
                    return new MapPosition(value.Table.Get("anchor").String);
                }
                if (value.Type != DataType.Table || value.Table.MetaTable != null || value.Table.Pairs.Any(pair =>
                    pair.Key.Type != DataType.String || pair.Key.String is not ("x" or "y")))
                    throw new ArgumentException($"{parameter} must be a plain position table with only x/y numbers.");
                var x = value.Table.Get("x");
                var y = value.Table.Get("y");
                if (x.Type != DataType.Number || y.Type != DataType.Number)
                    throw new ArgumentException($"{parameter} requires numeric x and y coordinates.");
                return new MapPosition(x.Number, y.Number);
            }
            return value.Type switch
            {
                DataType.String when type == typeof(string) && !string.IsNullOrWhiteSpace(value.String) => value.String,
                DataType.Boolean when type == typeof(bool) => value.Boolean,
                DataType.Number when type == typeof(double) && double.IsFinite(value.Number) => value.Number,
                DataType.Number when type == typeof(int) && value.Number == Math.Truncate(value.Number) &&
                    value.Number is >= int.MinValue and <= int.MaxValue => (int)value.Number,
                _ => throw new ArgumentException($"{parameter} must be a valid {type.Name}.")
            };
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
            if (type == typeof(void) || type == typeof(ILuaAction)) return "nil";
            if (type == typeof(string)) return "string";
            if (type == typeof(bool)) return "boolean";
            if (type == typeof(int)) return "integer";
            if (type == typeof(double)) return "number";
            if (type == typeof(MapPosition) || type == typeof(MapPosition?)) return "position";
            if (type == typeof(MapPath)) return "path";
            return type.Name; // [LuaTable] types were validated during registration.
        }

        private static InvalidOperationException Invalid(MethodInfo method, string reason) =>
            new($"Lua method {method.DeclaringType.Name}.{method.Name} {reason}.");

        private sealed record Module(string[] Path, List<Method> Methods);

        internal sealed record Method(object Api, MethodInfo Info, ParameterInfo[] Parameters,
            bool WritesState, LuaActionAttribute Action, MethodInfo Validator, LuaActionPreviewDescription Preview);
    }
}

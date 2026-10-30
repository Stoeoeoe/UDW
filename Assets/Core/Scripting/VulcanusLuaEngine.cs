using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Dialogue.Vulcanus;
using MoonSharp.Interpreter;

namespace Core.Scripting
{
    /// <summary>Shared Lua execution for dialogue, cutscenes, and other authored scripts.</summary>
    public sealed class VulcanusLuaEngine
    {
        private const int InstructionsPerSlice = 1000;
        private const int MaxSlices = 128;

        private readonly LuaBindingRegistry _bindings = new(DefaultModules.Select(module => module.Create()).ToArray());
        private readonly Dictionary<string, DynValue> _conditions = new(StringComparer.Ordinal);
        private Script _conditionScript;
        private readonly CutsceneVariables _variables;
        public VulcanusLuaEngine(CutsceneVariables variables = null) => _variables = variables;

        private static readonly (Type Type, Func<object> Create)[] DefaultModules = DiscoverModules();

        private static (Type Type, Func<object> Create)[] DiscoverModules()
        {
            var sceneModules = CutsceneBindings.ActionModules(null, null).Select(module => module.Type);
            // Only shipped APIs live in this assembly; editor fixtures are in a separate assembly.
            return typeof(LuaModuleAttribute).Assembly.GetTypes()
                .Where(type => type.IsDefined(typeof(LuaModuleAttribute), false))
                .Except(sceneModules)
                .Select(type => (type, (Func<object>)(() => Activator.CreateInstance(type, nonPublic: true))))
                .ToArray();
        }

        internal static (Type Type, Func<object> Create)[] Modules(VulcanusDialogueRunner dialogueRunner,
            Action<MapActorLuaApi> bindActors) => DefaultModules
            .Concat(CutsceneBindings.ActionModules(dialogueRunner, bindActors)).ToArray();

        // Infer the exported type from the factory rather than declaring it separately.
        internal static (Type Type, Func<object> Create) Module<T>(Func<T> create) where T : class =>
            (typeof(T), () => create());

        /// <summary>Lists the supported Lua APIs, including actions that need a map when they run.</summary>
        public static LuaBindingManifest DescribeBindings() => InspectBindings().Describe();

        /// <summary>Inspects shipped API signatures and authored values without constructing scene APIs.</summary>
        public static LuaBindingRegistry InspectBindings() => LuaBindingRegistry.InspectTypes(
            // Only inspect factory types. Export has no live state or scene dependencies.
            Modules(null, null).Select(module => module.Type).ToArray());

        public static LuaExecutionSession StartSession(LuaBindingRegistry actions, string chunk, string source,
            string context = "cutscene", string phase = "sequence", CutsceneVariables variables = null) =>
            new(actions ?? throw new ArgumentNullException(nameof(actions)), chunk, source, context, phase, variables);

        /// <summary>Compiles each distinct expression once, but reads live state on every evaluation.</summary>
        public bool EvaluateCondition(string expression)
        {
            if (string.IsNullOrWhiteSpace(expression)) return true;

            return EvaluateValue(expression).CastToBool();
        }

        /// <summary>Evaluates a graph's pure expression against the read-only API and current locals.</summary>
        public DynValue EvaluateValue(string expression)
        {
            if (string.IsNullOrWhiteSpace(expression)) throw new ArgumentException("Enter a read-only expression.", nameof(expression));

            if (!_conditions.TryGetValue(expression, out var function))
            {
                _conditionScript ??= CreateScript(false);
                function = _conditionScript.LoadString("return (" + expression + "\n)");
                _conditions[expression] = function;
            }

            return Run(_conditionScript, function);
        }

        /// <summary>Executes a writable chunk in a fresh, non-persistent Lua environment.</summary>
        public void Execute(string luaChunk)
        {
            if (string.IsNullOrWhiteSpace(luaChunk)) return;
            var script = CreateScript(true);
            Run(script, script.LoadString(luaChunk));
        }

        internal DynValue ExecuteValues(string luaChunk)
        {
            if (string.IsNullOrWhiteSpace(luaChunk)) throw new ArgumentException("Enter a Lua script.", nameof(luaChunk));
            var script = CreateScript(true);
            return Run(script, script.LoadString(luaChunk));
        }

        internal DynValue CallReadOnly(string path, DynValue[] arguments)
        {
            if (!System.Text.RegularExpressions.Regex.IsMatch(path, @"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$"))
                throw new ArgumentException("A declared Lua function path is required.", nameof(path));
            _conditionScript ??= CreateScript(false);
            var code = "return " + path + "(...)";
            if (!_conditions.TryGetValue(code, out var function)) _conditions[code] = function = _conditionScript.LoadString(code);
            return Run(_conditionScript, function, arguments.Select(v => LuaValues.Copy(v, _conditionScript)).ToArray());
        }

        private Script CreateScript(bool allowWrites)
        {
            // HardSandbox excludes file, OS, and dynamic code-loading modules.
            var script = new Script(CoreModules.Preset_HardSandbox);
            _bindings.Bind(script, allowWrites);
            _variables?.Bind(script, allowWrites); // Ordinary dialogue/scripts have no cutscene scope.
            return script;
        }

        private static DynValue Run(Script script, DynValue function, params DynValue[] arguments)
        {
            var routine = script.CreateCoroutine(function).Coroutine;
            routine.AutoYieldCounter = InstructionsPerSlice;
            for (var slice = 0; slice < MaxSlices; slice++)
            {
                var result = slice == 0 ? routine.Resume(arguments) : routine.Resume();
                if (result.Type != DataType.YieldRequest) return result;
            }

            throw new InvalidOperationException("Lua script exceeded its instruction budget.");
        }

    }
}

using System;
using System.Collections.Generic;
using Core.Game;
using MoonSharp.Interpreter;

namespace Core.Scripting
{
    /// <summary>Shared Lua execution for dialogue, cutscenes, and other authored scripts.</summary>
    public sealed class VulcanusLuaEngine
    {
        private const int InstructionsPerSlice = 1000;
        private const int MaxSlices = 128;

        private readonly LuaBindingRegistry _bindings;
        private readonly Dictionary<string, CompiledCondition> _conditions = new(StringComparer.Ordinal);

        public VulcanusLuaEngine()
        {
            _bindings = new LuaBindingRegistry(
                new StoryLuaApi(() => GameState.Story),
                new SkillsLuaApi(() => GameState.Player),
                new WorldLuaApi(() => GameState.World));
        }

        public VulcanusLuaEngine(StoryState story, PlayerState player, WorldState world)
        {
            if (story == null) throw new ArgumentNullException(nameof(story));
            if (player == null) throw new ArgumentNullException(nameof(player));
            if (world == null) throw new ArgumentNullException(nameof(world));

            _bindings = new LuaBindingRegistry(
                new StoryLuaApi(() => story),
                new SkillsLuaApi(() => player),
                new WorldLuaApi(() => world));
        }

        public LuaBindingManifest DescribeBindings() => _bindings.Describe();

        /// <summary>Compiles each distinct expression once, but reads live state on every evaluation.</summary>
        public bool EvaluateCondition(string expression)
        {
            if (string.IsNullOrWhiteSpace(expression)) return true;

            if (!_conditions.TryGetValue(expression, out var condition))
            {
                var script = CreateScript(false);
                condition = new CompiledCondition(script, script.LoadString("return " + expression));
                _conditions.Add(expression, condition);
            }

            return Run(condition.Script, condition.Function).CastToBool();
        }

        /// <summary>Executes a writable chunk in a fresh, non-persistent Lua environment.</summary>
        public void Execute(string luaChunk)
        {
            if (string.IsNullOrWhiteSpace(luaChunk)) return;
            var script = CreateScript(true);
            Run(script, script.LoadString(luaChunk));
        }

        private Script CreateScript(bool allowWrites)
        {
            // HardSandbox excludes file, OS, and dynamic code-loading modules.
            var script = new Script(CoreModules.Preset_HardSandbox);
            _bindings.Bind(script, allowWrites);
            return script;
        }

        private static DynValue Run(Script script, DynValue function)
        {
            var routine = script.CreateCoroutine(function).Coroutine;
            routine.AutoYieldCounter = InstructionsPerSlice;
            for (var slice = 0; slice < MaxSlices; slice++)
            {
                var result = routine.Resume();
                if (result.Type != DataType.YieldRequest) return result;
            }

            throw new InvalidOperationException("Lua script exceeded its instruction budget.");
        }

        private sealed class CompiledCondition
        {
            public readonly Script Script;
            public readonly DynValue Function;

            public CompiledCondition(Script script, DynValue function)
            {
                Script = script;
                Function = function;
            }
        }
    }
}

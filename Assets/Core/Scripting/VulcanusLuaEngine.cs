using System;
using System.Collections.Generic;
using Character;
using Core.Game;
using Core.GameplayTags;
using MoonSharp.Interpreter;

namespace Core.Scripting
{
    /// <summary>Shared Lua execution for dialogue, cutscenes, and other authored scripts.</summary>
    public sealed class VulcanusLuaEngine
    {
        private const int InstructionsPerSlice = 1000;
        private const int MaxSlices = 128;

        private readonly LuaBindingRegistry _bindings;
        private readonly Dictionary<string, DynValue> _conditions = new(StringComparer.Ordinal);
        private Script _conditionScript;

        public VulcanusLuaEngine()
            : this(() => GameState.Story, () => GameState.Player, () => GameState.World, null)
        {
        }

        public VulcanusLuaEngine(StoryState story, PlayerState player, WorldState world, Func<TagSet> playerTags = null)
            : this(Fixed(story, nameof(story)), Fixed(player, nameof(player)), Fixed(world, nameof(world)), playerTags)
        {
        }

        private VulcanusLuaEngine(Func<StoryState> story, Func<PlayerState> player, Func<WorldState> world,
            Func<TagSet> playerTags)
        {
            _bindings = new LuaBindingRegistry(
                new StoryLuaApi(story),
                new SkillsLuaApi(player),
                new WorldLuaApi(world),
                new CharacterTagLuaApi(playerTags ?? (() => MainCharacter.CurrentMainCharacter?.Tags)));
        }

        public LuaBindingManifest DescribeBindings() => _bindings.Describe();

        /// <summary>Compiles each distinct expression once, but reads live state on every evaluation.</summary>
        public bool EvaluateCondition(string expression)
        {
            if (string.IsNullOrWhiteSpace(expression)) return true;

            if (!_conditions.TryGetValue(expression, out var function))
            {
                _conditionScript ??= CreateScript(false);
                function = _conditionScript.LoadString("return " + expression);
                _conditions[expression] = function;
            }

            return Run(_conditionScript, function).CastToBool();
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

        private static Func<T> Fixed<T>(T value, string name) where T : class
        {
            return value == null ? throw new ArgumentNullException(name) : () => value;
        }
    }
}
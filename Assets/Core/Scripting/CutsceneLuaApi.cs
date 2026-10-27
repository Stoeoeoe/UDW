using System;
using MoonSharp.Interpreter;
using UnityEngine.Scripting;

namespace Core.Scripting
{
    [LuaModule("Cutscene")]
    public sealed class CutsceneLuaApi
    {
        [LuaAction("cutscene.runLua", "Run Lua", "Scripting",
            "Run a Lua script immediately using the scripting API. Timed actions remain separate steps.",
            "cutscene", Validator = nameof(ValidateLua), Phases = new[] { "sequence" })]
        [LuaPreview(LuaPreviewSpatialState.Unknown)]
        public void RunLua([LuaCode] string code)
        {
            ValidateLua(code);
            new VulcanusLuaEngine().Execute(code);
        }

        [Preserve]
        public static void ValidateLua(string code)
        {
            if (string.IsNullOrWhiteSpace(code))
                throw new ArgumentException("Enter a Lua script.", nameof(code));
            // Compile without executing: import validation must never mutate game state.
            new Script(CoreModules.Preset_HardSandbox).LoadString(code, null, "Cutscene Lua block");
        }

        [LuaAction("cutscene.wait", "Wait", "Timing", "Wait for gameplay seconds.", "cutscene", Validator = nameof(ValidateWait), Phases = new[] { "sequence" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        public ILuaAction Wait(double seconds)
        {
            ValidateWait(seconds);
            return new WaitAction(seconds);
        }

        [Preserve]
        public static void ValidateWait(double seconds)
        {
            if (double.IsNaN(seconds) || double.IsInfinity(seconds) || seconds < 0)
                throw new ArgumentOutOfRangeException(nameof(seconds), "Wait seconds must be finite and nonnegative.");
        }

        private sealed class WaitAction : ILuaAction
        {
            private double _remaining;
            public bool IsCompleted => _remaining <= 0;
            public WaitAction(double seconds) => _remaining = seconds;
            public void Tick(float deltaTime) => _remaining -= deltaTime;
            public void Dispose() { }
        }
    }
}

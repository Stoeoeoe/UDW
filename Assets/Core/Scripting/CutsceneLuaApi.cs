using System;
using UnityEngine.Scripting;

namespace Core.Scripting
{
    [LuaModule("Cutscene")]
    public sealed class CutsceneLuaApi
    {
        [LuaAction("cutscene.wait", "Wait", "Timing", "Wait for gameplay seconds.", "cutscene", Validator = nameof(ValidateWait))]
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

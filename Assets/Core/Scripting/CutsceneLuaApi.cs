using System;

namespace Core.Scripting
{
    /// <summary>The pending outcome of one cutscene; the runner saves it only on completion or skip.</summary>
    [LuaModule("Cutscene")]
    public sealed class CutsceneLuaApi
    {
        public string Outcome { get; private set; }
        public CutsceneLuaApi(string outcome) => Outcome = outcome;

        [LuaCall(true)]
        [LuaAction("cutscene.setOutcome", "Set outcome", "Cutscene", "Choose the outcome saved when this cutscene finishes.", "cutscene")]
        public void SetOutcome(string outcome)
        {
            if (string.IsNullOrWhiteSpace(outcome)) throw new ArgumentException("A cutscene outcome must be non-empty.", nameof(outcome));
            Outcome = outcome;
        }
    }
}

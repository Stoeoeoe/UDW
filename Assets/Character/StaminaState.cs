using System;

namespace Character
{
    /// <summary>Saved current stamina, with a marker distinguishing first initialization from an exhausted character.</summary>
    [Serializable]
    public sealed class StaminaState
    {
        public bool Initialized;
        public int Current;
    }
}

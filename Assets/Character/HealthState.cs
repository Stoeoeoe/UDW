using System;

namespace Character
{
    /// <summary>Saved current health; an uninitialized character starts at its final maximum after equipment and boons bind.</summary>
    [Serializable]
    public sealed class HealthState
    {
        public bool Initialized;
        public int Current;
    }
}

using System;

namespace Character
{
    /// <summary>Saved normal health and spendable surplus. New characters start at their final maximum.</summary>
    [Serializable]
    public sealed class HealthState
    {
        public bool Initialized;
        public int Current;
        public int Overcharge;
    }
}

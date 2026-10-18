using System;

namespace Character
{
    /// <summary>Saved normal stamina and spendable surplus, with a marker distinguishing new from exhausted characters.</summary>
    [Serializable]
    public sealed class StaminaState
    {
        public bool Initialized;
        public int Current;
        public int Overcharge;
    }
}

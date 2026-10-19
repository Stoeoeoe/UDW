using System;

namespace Core.Inventory
{
    /// <summary>Saved charge and capacity for a carried tool, including capacity upgrades.</summary>
    [Serializable]
    public sealed class ToolChargeState
    {
        public int Capacity;
        public int Current;
        [NonSerialized] private Action _changed;

        internal void Bind(Action changed) => _changed = changed;

        public ToolChargeState(int capacity)
        {
            Capacity = capacity;
            Current = capacity;
        }

        public bool TryConsume(int amount)
        {
            if (Current < amount) return false;
            Current -= amount;
            _changed?.Invoke();
            return true;
        }

        public void Refill()
        {
            Current = Capacity;
            _changed?.Invoke();
        }

        /// <summary>Upgrades the tank without granting water; the next refill uses the larger capacity.</summary>
        public void IncreaseCapacity(int amount)
        {
            Capacity += amount;
            _changed?.Invoke();
        }
    }
}

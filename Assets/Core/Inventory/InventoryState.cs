using System;

namespace Core.Inventory
{
    /// <summary>Save-owned, ordered slots. No Unity asset references are persisted.</summary>
    [Serializable]
    public sealed class InventoryState
    {
        // Null means capacity has not been initialized yet; an empty inventory still has slots.
        public InventorySlotState[] Slots;
        public bool StartingLoadoutApplied;
        public InventorySlotState HeldSlot;
        public int HeldSourceIndex = -1;
    }

    [Serializable]
    public struct InventorySlotState
    {
        public string ItemId;
        public int Quantity;

        public InventorySlotState(string itemId, int quantity)
        {
            ItemId = itemId;
            Quantity = quantity;
        }
    }
}

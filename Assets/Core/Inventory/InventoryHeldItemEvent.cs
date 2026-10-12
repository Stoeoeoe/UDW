using Core.Events;

namespace Core.Inventory
{
    /// <summary>
    /// Event published after the saved held stack changes. UI displays subscribe to it.
    /// </summary>
    public struct InventoryHeldItemEvent
    {
        public ItemDefinition HeldItem;
        public int Quantity;
        public int SourceSlotIndex;

        public static void Trigger(ItemDefinition heldItem, int quantity, int sourceSlotIndex)
            => EventBus<InventoryHeldItemEvent>.Raise(new InventoryHeldItemEvent
            {
                HeldItem        = heldItem,
                Quantity        = quantity,
                SourceSlotIndex = sourceSlotIndex,
            });

        public static void TriggerClear() => Trigger(null, 0, -1);
    }
}


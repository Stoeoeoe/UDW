using Core.Events;
using Core.Inventory;

namespace UI.InventoryScreen
{
    /// <summary>
    /// Event triggered when an item is picked up or put down in the inventory UI.
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


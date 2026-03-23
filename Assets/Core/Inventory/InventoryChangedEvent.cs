using Core.Events;

namespace Core.Inventory
{
    /// <summary>
    /// Raised whenever the content of an inventory changes (add, remove, move).
    /// </summary>
    public struct InventoryChangedEvent
    {
        public SlotInventory InventoryRef;

        public static void Trigger(SlotInventory inventory)
            => EventBus<InventoryChangedEvent>.Raise(new InventoryChangedEvent { InventoryRef = inventory });
    }
}

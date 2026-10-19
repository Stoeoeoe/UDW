using Core.Events;

namespace Core.Inventory
{
    /// <summary>
    /// Raised after inventory contents, loadout or carried tool charges change.
    /// </summary>
    public struct InventoryChangedEvent
    {
        public SlotInventory InventoryRef;

        public static void Trigger(SlotInventory inventory)
            => EventBus<InventoryChangedEvent>.Raise(new InventoryChangedEvent { InventoryRef = inventory });
    }
}

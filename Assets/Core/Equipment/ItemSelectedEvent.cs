using Core.Events;
using Items;
using Core.Inventory;

namespace Core.Equipment
{
    public struct ItemSelectedEvent
    {
        public EquippableItem HeldItem;
        public int InventorySlotIndex;
        public SlotInventory Inventory;

        public static void Trigger(EquippableItem heldItem, int inventorySlotIndex, SlotInventory inventory = null)
            => EventBus<ItemSelectedEvent>.Raise(new ItemSelectedEvent { HeldItem = heldItem, InventorySlotIndex = inventorySlotIndex, Inventory = inventory });
    }
}

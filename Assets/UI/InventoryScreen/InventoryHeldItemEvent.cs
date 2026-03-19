using MoreMountains.InventoryEngine;
using MoreMountains.Tools;

namespace UI.InventoryScreen
{
    /// <summary>
    /// Event triggered when an item is picked up or put down in the inventory UI
    /// </summary>
    public struct InventoryHeldItemEvent
    {
        public InventoryItem HeldItem;
        public int Quantity;
        public int SourceSlotIndex;
        
        static InventoryHeldItemEvent e;
        
        /// <summary>
        /// Triggers the event with the specified item
        /// </summary>
        public static void Trigger(InventoryItem heldItem, int quantity, int sourceSlotIndex)
        {
            e.HeldItem = heldItem;
            e.Quantity = quantity;
            e.SourceSlotIndex = sourceSlotIndex;
            MMEventManager.TriggerEvent(e);
        }
        
        /// <summary>
        /// Triggers the event to clear the held item
        /// </summary>
        public static void TriggerClear()
        {
            Trigger(null, 0, -1);
        }
    }
}


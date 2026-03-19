using Items;
using MoreMountains.Tools;

namespace Core.Equipment
{
    public struct ItemSelectedEvent
    {
        public EquippableItem HeldItem;
        public int HotbarSlotIndex;

        static ItemSelectedEvent e;
        public static void Trigger(EquippableItem heldItem, int hotbarSlotIndex)
        {
            e.HeldItem = heldItem;
            e.HotbarSlotIndex = hotbarSlotIndex;
            MMEventManager.TriggerEvent(e);
        }
    }
}
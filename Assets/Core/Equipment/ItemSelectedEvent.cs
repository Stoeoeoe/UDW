using Core.Events;
using Items;

namespace Core.Equipment
{
    public struct ItemSelectedEvent
    {
        public EquippableItem HeldItem;
        public int HotbarSlotIndex;

        public static void Trigger(EquippableItem heldItem, int hotbarSlotIndex)
            => EventBus<ItemSelectedEvent>.Raise(new ItemSelectedEvent { HeldItem = heldItem, HotbarSlotIndex = hotbarSlotIndex });
    }
}
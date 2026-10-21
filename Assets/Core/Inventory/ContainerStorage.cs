using System;
using Character;

namespace Core.Inventory
{
    /// <summary>Storage with recorded ownership; both inventories commit before notifications.</summary>
    public sealed class ContainerStorage
    {
        public ContainerState State { get; }
        public InventoryStorage Inventory { get; }

        public ContainerStorage(ContainerState state, Func<string, CharacterDefinition> resolveCharacter,
            Func<string, ItemDefinition> resolveItem)
        {
            ValidateState(state, resolveCharacter, resolveItem);
            State = state;
            Inventory = new InventoryStorage(state.Inventory, resolveItem, state.Inventory.Slots.Length);
        }

        public static void ValidateState(ContainerState state, Func<string, CharacterDefinition> resolveCharacter,
            Func<string, ItemDefinition> resolveItem)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            if (resolveCharacter == null) throw new ArgumentNullException(nameof(resolveCharacter));
            if (resolveItem == null) throw new ArgumentNullException(nameof(resolveItem));
            if (string.IsNullOrWhiteSpace(state.OwnerCharacterId) || !resolveCharacter(state.OwnerCharacterId))
                throw new InvalidOperationException($"Container owner '{state.OwnerCharacterId}' is not a registered character.");
            if (state.Inventory?.Slots == null || state.Inventory.Slots.Length == 0)
                throw new InvalidOperationException("A saved container requires initialized, nonempty slot capacity.");
            foreach (var slot in state.Inventory.Slots)
            {
                if (slot.Quantity < 0 || (slot.Quantity == 0 && !string.IsNullOrEmpty(slot.ItemId)))
                    throw new InvalidOperationException("Container contains an invalid saved slot.");
                if (slot.Quantity == 0) continue;
                var item = resolveItem(slot.ItemId);
                if (!item || slot.Quantity > item.MaxStackSize)
                    throw new InvalidOperationException($"Container contains an invalid stack for '{slot.ItemId}'.");
            }
            if (state.Inventory.HeldSlot.Quantity != 0 || !string.IsNullOrEmpty(state.Inventory.HeldSlot.ItemId))
                throw new InvalidOperationException("Container storage cannot own a cursor-held stack.");
        }

        public bool TryDeposit(InventoryStorage bag, int slot, int quantity) =>
            Transfer(bag, Inventory, slot, quantity);
        public bool TryWithdraw(InventoryStorage bag, int slot, int quantity) =>
            Transfer(Inventory, bag, slot, quantity);

        private static bool Transfer(InventoryStorage source, InventoryStorage target, int index, int quantity)
        {
            if (source == null) throw new ArgumentNullException(nameof(source));
            if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity));
            source.CheckIndex(index);
            var stack = source.GetSlot(index);
            if (stack.IsEmpty) return false;
            if (quantity > stack.Quantity) throw new ArgumentOutOfRangeException(nameof(quantity));
            var remaining = quantity == stack.Quantity ? ItemStack.Empty : new ItemStack(stack.Item, stack.Quantity - quantity);
            if (!target.AddItem(stack.Item, quantity)) return false;
            source.SetSlot(index, remaining);
            return true;
        }
    }
}

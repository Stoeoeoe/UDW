using System;

namespace Core.Inventory
{
    /// <summary>Transfers between bag slots and the save-owned held stack.</summary>
    public sealed class InventoryInteraction
    {
        private readonly InventoryStorage _storage;
        private readonly Action _changed;
        private InventoryState _state;
        public ItemStack HeldStack => _storage.Resolve(_state.HeldSlot);
        public int HeldSourceIndex => _state.HeldSourceIndex;

        public InventoryInteraction(InventoryStorage storage, InventoryState state, Action changed)
        {
            _storage = storage ?? throw new ArgumentNullException(nameof(storage));
            _changed = changed ?? throw new ArgumentNullException(nameof(changed));
            Bind(state);
        }
        internal void Bind(InventoryState state) => _state = state ?? throw new ArgumentNullException(nameof(state));

        private void SetHeld(ItemStack stack, int source)
        {
            var saved = _storage.Encode(stack);
            _state.HeldSlot = saved;
            _state.HeldSourceIndex = stack.Quantity == 0 ? -1 : source;
        }
        // Equipment transactions call this only after preparing all participants.
        internal void RemoveHeldSilently(int quantity)
        {
            var held = HeldStack;
            if (quantity <= 0 || quantity > held.Quantity) throw new ArgumentOutOfRangeException(nameof(quantity));
            SetHeld(new ItemStack(held.Item, held.Quantity - quantity), HeldSourceIndex);
        }

        public bool TryPickUp(int index, int quantity)
        {
            _storage.CheckIndex(index);
            if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity));
            if (!HeldStack.IsEmpty) return false;
            var stack = _storage.GetSlot(index);
            if (stack.IsEmpty || quantity > stack.Quantity) return false;
            _storage.SetSlot(index, new ItemStack(stack.Item, stack.Quantity - quantity));
            SetHeld(new ItemStack(stack.Item, quantity), index);
            _changed();
            return true;
        }
        public bool TryPlaceHeld(int index, bool one = false)
        {
            var target = _storage.GetSlot(index);
            var held = HeldStack;
            if (held.IsEmpty) return false;
            if (target.IsEmpty || target.Item == held.Item)
            {
                var amount = Math.Min(one ? 1 : held.Quantity, held.Item.MaxStackSize - target.Quantity);
                if (amount == 0) return false;
                _storage.SetSlot(index, new ItemStack(held.Item, target.Quantity + amount));
                SetHeld(new ItemStack(held.Item, held.Quantity - amount), HeldSourceIndex);
            }
            else
            {
                if (one) return false;
                _storage.SetSlot(index, held);
                SetHeld(target, index);
            }
            _changed();
            return true;
        }
        public bool TryReturnHeld()
        {
            var held = HeldStack;
            if (held.IsEmpty) return true;
            var source = HeldSourceIndex;
            if (source >= 0)
            {
                var target = _storage.GetSlot(source);
                if (target.IsEmpty || target.Item == held.Item && held.Quantity <= held.Item.MaxStackSize - target.Quantity)
                {
                    _storage.SetSlot(source, new ItemStack(held.Item, target.Quantity + held.Quantity));
                    SetHeld(ItemStack.Empty, -1);
                    _changed();
                    return true;
                }
            }
            if (!_storage.AddItem(held.Item, held.Quantity)) return false;
            SetHeld(ItemStack.Empty, -1);
            _changed();
            return true;
        }
    }
}

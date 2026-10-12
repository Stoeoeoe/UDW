using System;
using System.Collections.Generic;
using System.Linq;

namespace Core.Inventory
{
    /// <summary>Bag slots and stacking. Mutates the live save state, without notifications.</summary>
    public sealed class InventoryStorage
    {
        private InventoryState _state;
        private Func<string, ItemDefinition> _resolve;
        private readonly Dictionary<string, ItemDefinition> _knownItems = new(StringComparer.Ordinal);
        public int Capacity => _state.Slots.Length;

        public InventoryStorage(InventoryState state, Func<string, ItemDefinition> resolve, int initialCapacity)
            => Bind(state, resolve, initialCapacity);

        public void Bind(InventoryState state, Func<string, ItemDefinition> resolve, int initialCapacity)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            if (resolve == null) throw new ArgumentNullException(nameof(resolve));
            state.Slots ??= new InventorySlotState[initialCapacity];
            _state = state;
            _resolve = resolve;
            _knownItems.Clear();
        }

        public ItemStack GetSlot(int index) => Resolve(_state.Slots[index]);
        public ItemStack[] GetSnapshot()
        {
            var snapshot = new ItemStack[Capacity];
            for (var i = 0; i < snapshot.Length; i++) snapshot[i] = GetSlot(i);
            return snapshot;
        }

        internal ItemStack Resolve(InventorySlotState slot)
        {
            if (slot.Quantity == 0) return ItemStack.Empty;
            if (!_knownItems.TryGetValue(slot.ItemId, out var item))
            {
                item = _resolve(slot.ItemId);
                if (!item) throw new InvalidOperationException($"Required inventory definition '{slot.ItemId}' is missing.");
                _knownItems.Add(slot.ItemId, item);
            }
            return new ItemStack(item, slot.Quantity);
        }

        internal void RememberItem(ItemDefinition item) => _knownItems[item.ItemId] = item;
        internal InventorySlotState Encode(ItemStack stack)
        {
            if (stack.Quantity < 0) throw new ArgumentOutOfRangeException(nameof(stack));
            if (stack.Quantity == 0) return default;
            if (!stack.Item) throw new ArgumentException("An occupied slot requires an item definition.", nameof(stack));
            if (stack.Quantity > stack.Item.MaxStackSize) throw new ArgumentException("Stack exceeds its item limit.", nameof(stack));
            RememberItem(stack.Item);
            return new InventorySlotState(stack.Item.ItemId, stack.Quantity);
        }

        public void SetSlot(int index, ItemStack stack)
        {
            CheckIndex(index);
            var saved = Encode(stack);
            _state.Slots[index] = saved;
        }
        internal void CheckIndex(int index)
        {
            if (index < 0 || index >= Capacity) throw new ArgumentOutOfRangeException(nameof(index));
        }
        private static void CheckQuantity(int quantity)
        {
            if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity));
        }

        public bool CanAdd(ItemDefinition item, int quantity)
        {
            if (!item) throw new ArgumentNullException(nameof(item));
            CheckQuantity(quantity);
            long available = 0;
            for (var i = 0; i < Capacity; i++)
            {
                var stack = GetSlot(i);
                if (stack.IsEmpty) available += item.MaxStackSize;
                else if (stack.Item == item) available += item.MaxStackSize - stack.Quantity;
            }
            return available >= quantity;
        }

        public bool AddItem(ItemDefinition item, int quantity)
        {
            // Check the complete addition before writing any slot. Ordinary additions
            // preserve the saved array and do not allocate an inventory snapshot.
            if (!CanAdd(item, quantity)) return false;
            var remaining = quantity;
            for (var i = 0; i < Capacity && remaining > 0; i++)
            {
                var stack = GetSlot(i);
                if (!stack.IsEmpty && stack.Item == item)
                {
                    var added = Math.Min(item.MaxStackSize - stack.Quantity, remaining);
                    if (added > 0) SetSlot(i, new ItemStack(item, stack.Quantity + added));
                    remaining -= added;
                }
            }
            for (var i = 0; i < Capacity && remaining > 0; i++)
                if (GetSlot(i).IsEmpty)
                {
                    var added = Math.Min(item.MaxStackSize, remaining);
                    SetSlot(i, new ItemStack(item, added));
                    remaining -= added;
                }
            return true;
        }

        public bool RemoveItemAt(int index, int quantity = 1)
        {
            CheckQuantity(quantity);
            var stack = GetSlot(index);
            if (stack.IsEmpty) return false;
            SetSlot(index, quantity >= stack.Quantity ? ItemStack.Empty : new ItemStack(stack.Item, stack.Quantity - quantity));
            return true;
        }
        public void MoveItem(int from, int to)
        {
            CheckIndex(from); CheckIndex(to);
            (_state.Slots[from], _state.Slots[to]) = (_state.Slots[to], _state.Slots[from]);
        }
        public void SortStorage()
        {
            var sorted = GetSnapshot().OrderBy(s => s.IsEmpty)
                .ThenBy(s => s.IsEmpty ? string.Empty : s.Item.Category, StringComparer.Ordinal)
                .ThenBy(s => s.IsEmpty ? string.Empty : s.Item.ItemName, StringComparer.Ordinal)
                .ThenBy(s => s.ItemId, StringComparer.Ordinal).ToArray();
            CommitContent(sorted);
        }

        // Full snapshots are reserved for all-or-nothing transactions and bulk sorting.
        public bool TryPrepareAddition(ItemDefinition item, int quantity, out ItemStack[] result)
            => TryPrepareAddition(item, quantity, GetSnapshot(), out result);
        public bool TryPrepareAddition(ItemDefinition item, int quantity, ItemStack[] content, out ItemStack[] result)
        {
            if (!item) throw new ArgumentNullException(nameof(item));
            CheckQuantity(quantity);
            if (content == null) throw new ArgumentNullException(nameof(content));
            var prepared = (ItemStack[])content.Clone();
            var remaining = quantity;
            for (var i = 0; i < prepared.Length && remaining > 0; i++)
                if (!prepared[i].IsEmpty && prepared[i].Item == item)
                {
                    var added = Math.Min(item.MaxStackSize - prepared[i].Quantity, remaining);
                    prepared[i] = new ItemStack(item, prepared[i].Quantity + added);
                    remaining -= added;
                }
            for (var i = 0; i < prepared.Length && remaining > 0; i++)
                if (prepared[i].IsEmpty)
                {
                    var added = Math.Min(item.MaxStackSize, remaining);
                    prepared[i] = new ItemStack(item, added);
                    remaining -= added;
                }
            result = remaining == 0 ? prepared : null;
            return remaining == 0;
        }
        internal void CommitContent(ItemStack[] content)
        {
            if (content.Length != Capacity) throw new ArgumentException("A slot transaction must preserve capacity.", nameof(content));
            var saved = new InventorySlotState[content.Length];
            for (var i = 0; i < saved.Length; i++) saved[i] = Encode(content[i]);
            Array.Copy(saved, _state.Slots, saved.Length);
        }
        internal InventorySlotState[] PrepareExpansion(int capacity)
        {
            if (capacity <= Capacity) throw new ArgumentOutOfRangeException(nameof(capacity));
            var slots = new InventorySlotState[capacity];
            Array.Copy(_state.Slots, slots, Capacity);
            return slots;
        }
        internal void CommitExpansion(InventorySlotState[] slots) => _state.Slots = slots;
    }
}

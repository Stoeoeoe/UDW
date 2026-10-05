using System;
using System.Collections.Generic;
using Items;
using UnityEngine;

namespace Core.Inventory
{
    /// <summary>
    /// Slot-based item container.
    /// Register by name+playerID so code can call Inventory.FindInventory(name, playerID).
    /// </summary>
    public class SlotInventory : MonoBehaviour
    {
        [SerializeField] string _inventoryName;
        [SerializeField] string _playerID      = "Player1";
        [SerializeField] int    _numberOfSlots = 15;

        static readonly Dictionary<(string, string), SlotInventory> _registry = new();

        public string     InventoryName => _inventoryName;
        public string     PlayerID      => _playerID;
        private InventoryState _state;
        private Func<string, ItemDefinition> _resolve = ItemCatalog.Find;
        private readonly Dictionary<string, ItemDefinition> _knownItems = new(StringComparer.Ordinal);

        public ItemStack HeldStack
        {
            get => _state == null ? ItemStack.Empty : Resolve(_state.HeldSlot);
            set
            {
                _state.HeldSlot = ToSavedSlot(value);
                if (value.Item) _knownItems[value.Item.ItemId] = value.Item;
            }
        }

        public int HeldSourceIndex
        {
            get => _state?.HeldSourceIndex ?? -1;
            set => _state.HeldSourceIndex = value;
        }

        private ItemStack Resolve(InventorySlotState slot)
        {
            var item = string.IsNullOrEmpty(slot.ItemId) ? null :
                _knownItems.TryGetValue(slot.ItemId, out var known) ? known : _resolve(slot.ItemId);
            return new ItemStack(item, slot.Quantity) { ItemId = slot.ItemId };
        }

        private static InventorySlotState ToSavedSlot(ItemStack stack)
        {
            var id = stack.Item ? stack.Item.ItemId : stack.ItemId;
            if (stack.IsOccupied && string.IsNullOrWhiteSpace(id))
                throw new ArgumentException("An inventory item needs a stable ItemId.");
            return stack.IsOccupied ? new InventorySlotState(id, stack.Quantity) : default;
        }

        /// <summary>Resolved snapshot. Change slots through this inventory, not this array.</summary>
        public ItemStack[] Content
        {
            get
            {
                if (_state?.Slots == null) return null;
                var content = new ItemStack[_state.Slots.Length];
                for (var i = 0; i < content.Length; i++)
                {
                    content[i] = Resolve(_state.Slots[i]);
                }
                return content;
            }
        }

        void Awake()
        {
            _state ??= new InventoryState { Slots = new InventorySlotState[_numberOfSlots] };
            _registry[(_inventoryName, _playerID)] = this;
        }

        void OnDestroy() => _registry.Remove((_inventoryName, _playerID));

        /// <summary>Rebinds on player spawn/load; existing capacity and empty slots are preserved.</summary>
        public void Bind(InventoryState state, Func<string, ItemDefinition> resolve = null)
        {
            _state = state ?? throw new ArgumentNullException(nameof(state));
            _state.Slots ??= new InventorySlotState[_numberOfSlots];
            _resolve = resolve ?? ItemCatalog.Find;
            _knownItems.Clear();
            InventoryChangedEvent.Trigger(this);
        }

        /// <summary>Seeds once, atomically. Overflow or invalid items leave contents and marker untouched.</summary>
        public bool ApplyStartingLoadout(IEnumerable<ItemDefinition> items)
        {
            if (_state.StartingLoadoutApplied) return true;
            var prepared = Content;
            foreach (var item in items)
                if (!TryPrepareAddition(item, 1, prepared, out prepared)) return false;
            CommitContent(prepared);
            _state.StartingLoadoutApplied = true;
            InventoryChangedEvent.Trigger(this);
            return true;
        }

        // ── Static lookup ────────────────────────────────────────────────────────────

        public static SlotInventory FindInventory(string inventoryName, string playerID)
        {
            _registry.TryGetValue((inventoryName, playerID), out var inv);
            return inv;
        }

        // ── Mutation API ─────────────────────────────────────────────────────────────

        /// <summary>Adds quantity of item to first available/stackable slot. Returns true on success.</summary>
        public bool AddItem(ItemDefinition item, int quantity)
        {
            if (!TryPrepareAddition(item, quantity, out var updatedContent)) return false;
            CommitContent(updatedContent);
            InventoryChangedEvent.Trigger(this);
            return true;
        }

        // Trading prepares the complete inventory change before committing money or stock.
        internal bool TryPrepareAddition(ItemDefinition item, int quantity, out ItemStack[] updatedContent)
            => TryPrepareAddition(item, quantity, Content, out updatedContent);

        private static bool TryPrepareAddition(ItemDefinition item, int quantity, ItemStack[] content, out ItemStack[] updatedContent)
        {
            updatedContent = null;
            if (item == null || string.IsNullOrWhiteSpace(item.ItemId) || quantity <= 0 || content == null) return false;

            updatedContent = (ItemStack[])content.Clone();
            var remaining = quantity;

            // Try to stack onto existing slots first
            if (item.MaxStackSize > 1)
            {
                for (int i = 0; i < updatedContent.Length && remaining > 0; i++)
                {
                    if (updatedContent[i].Item == item && updatedContent[i].Quantity < item.MaxStackSize)
                    {
                        int space = item.MaxStackSize - updatedContent[i].Quantity;
                        int toAdd = Mathf.Min(space, remaining);
                        updatedContent[i] = new ItemStack(item, updatedContent[i].Quantity + toAdd);
                        remaining -= toAdd;
                    }
                }
            }

            // Fill empty slots, splitting across multiple slots when needed.
            for (int i = 0; i < updatedContent.Length && remaining > 0; i++)
            {
                if (!updatedContent[i].IsOccupied)
                {
                    int toAdd = item.MaxStackSize > 1
                        ? Mathf.Min(item.MaxStackSize, remaining)
                        : 1;
                    updatedContent[i] = new ItemStack(item, toAdd);
                    remaining -= toAdd;
                }
            }

            if (remaining > 0)
                return false; // Inventory full

            return true;
        }

        internal void CommitContent(ItemStack[] content)
        {
            var slots = new InventorySlotState[content.Length];
            for (var i = 0; i < content.Length; i++)
            {
                slots[i] = ToSavedSlot(content[i]);
            }
            foreach (var stack in content)
                if (stack.Item) _knownItems[stack.Item.ItemId] = stack.Item;
            _state.Slots = slots;
        }

        /// <summary>Removes items from a specific slot index.</summary>
        public void RemoveItemAt(int slotIndex, int quantity = 1)
        {
            if (quantity <= 0) return;
            if (slotIndex < 0 || slotIndex >= Content.Length) return;
            var stack = Content[slotIndex];
            if (stack.IsEmpty) return;
            int remaining = stack.Quantity - quantity;
            var content = Content;
            content[slotIndex] = remaining > 0
                ? new ItemStack(stack.Item, remaining)
                : ItemStack.Empty;
            CommitContent(content);
            InventoryChangedEvent.Trigger(this);
        }

        /// <summary>Swaps the contents of two slots.</summary>
        public void MoveItem(int fromSlot, int toSlot)
        {
            if (fromSlot < 0 || fromSlot >= Content.Length) return;
            if (toSlot   < 0 || toSlot   >= Content.Length) return;
            var content = Content;
            (content[fromSlot], content[toSlot]) = (content[toSlot], content[fromSlot]);
            CommitContent(content);
            InventoryChangedEvent.Trigger(this);
        }

        /// <summary>Sets a slot directly (use with caution — bypasses stacking rules).</summary>
        public void SetSlot(int slotIndex, ItemStack stack)
        {
            if (!SetSlotSilently(slotIndex, stack)) return;
            InventoryChangedEvent.Trigger(this);
        }

        // UI drag/drop commits the held stack and destination before publishing either event.
        internal bool SetSlotSilently(int slotIndex, ItemStack stack)
        {
            if (slotIndex < 0 || slotIndex >= Content.Length) return false;
            var content = Content;
            content[slotIndex] = stack;
            CommitContent(content);
            return true;
        }

        public void UseItem(ItemDefinition item, int slot)
        {
            // TODO! This is where we would trigger the item's behavior (e.g. equip, consume, etc.).
            if (item is ConsumableItem)
            {
                // TODO ItemRegistry.Instance.GetBehavior(item).Execute();
            } else if (item is EquippableItem)
            {
                // TODO GameCharacter.SetHeldItem((EquippableItem)item);
            } else
            {
                Debug.LogWarning($"Using item {item.ItemName} has no defined behavior.");
            }
        }
    }
}

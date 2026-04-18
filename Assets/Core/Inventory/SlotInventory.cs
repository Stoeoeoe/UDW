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
        public ItemStack[] Content      { get; private set; }

        void Awake()
        {
            Content = new ItemStack[_numberOfSlots];
            for (int i = 0; i < Content.Length; i++)
                Content[i] = ItemStack.Empty;
            _registry[(_inventoryName, _playerID)] = this;
        }

        void OnDestroy() => _registry.Remove((_inventoryName, _playerID));

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
            if (item == null || quantity <= 0) return false;

            var updatedContent = (ItemStack[])Content.Clone();
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
                if (updatedContent[i].IsEmpty)
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

            Content = updatedContent;
            InventoryChangedEvent.Trigger(this);
            return true;
        }

        /// <summary>Removes items from a specific slot index.</summary>
        public void RemoveItemAt(int slotIndex, int quantity = 1)
        {
            if (slotIndex < 0 || slotIndex >= Content.Length) return;
            var stack = Content[slotIndex];
            if (stack.IsEmpty) return;
            int remaining = stack.Quantity - quantity;
            Content[slotIndex] = remaining > 0
                ? new ItemStack(stack.Item, remaining)
                : ItemStack.Empty;
            InventoryChangedEvent.Trigger(this);
        }

        /// <summary>Swaps the contents of two slots.</summary>
        public void MoveItem(int fromSlot, int toSlot)
        {
            if (fromSlot < 0 || fromSlot >= Content.Length) return;
            if (toSlot   < 0 || toSlot   >= Content.Length) return;
            (Content[fromSlot], Content[toSlot]) = (Content[toSlot], Content[fromSlot]);
            InventoryChangedEvent.Trigger(this);
        }

        /// <summary>Sets a slot directly (use with caution — bypasses stacking rules).</summary>
        public void SetSlot(int slotIndex, ItemStack stack)
        {
            if (slotIndex < 0 || slotIndex >= Content.Length) return;
            Content[slotIndex] = stack;
            InventoryChangedEvent.Trigger(this);
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

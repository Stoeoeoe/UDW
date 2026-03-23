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

            // Try to stack onto existing slots first
            if (item.MaxStackSize > 1)
            {
                for (int i = 0; i < Content.Length; i++)
                {
                    if (Content[i].Item == item && Content[i].Quantity < item.MaxStackSize)
                    {
                        int space = item.MaxStackSize - Content[i].Quantity;
                        int toAdd = Mathf.Min(space, quantity);
                        Content[i] = new ItemStack(item, Content[i].Quantity + toAdd);
                        quantity -= toAdd;
                        InventoryChangedEvent.Trigger(this);
                        if (quantity <= 0) return true;
                    }
                }
            }

            // Find empty slot
            for (int i = 0; i < Content.Length; i++)
            {
                if (Content[i].IsEmpty)
                {
                    Content[i] = new ItemStack(item, quantity);
                    InventoryChangedEvent.Trigger(this);
                    return true;
                }
            }

            return false; // Inventory full
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

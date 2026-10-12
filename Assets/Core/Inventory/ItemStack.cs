using System;
using UnityEngine;

namespace Core.Inventory
{
    /// <summary>
    /// Represents a stack of items (one slot in an Inventory).
    /// </summary>
    [Serializable]
    public struct ItemStack
    {
        public ItemDefinition Item;
        public int            Quantity;
        // Stable ID of the resolved definition; only InventoryState stores save data.
        public string ItemId;
        public bool IsOccupied => Quantity > 0;

        public static ItemStack Empty => new ItemStack { Item = null, Quantity = 0 };

        public bool IsEmpty => Quantity == 0;

        public ItemStack(ItemDefinition item, int quantity)
        {
            Item     = item;
            Quantity = quantity;
            ItemId = item != null ? item.ItemId : null;
        }

        public static bool IsNull(ItemStack stack) => stack.IsEmpty;
    }
}

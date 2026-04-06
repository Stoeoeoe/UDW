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

        public static ItemStack Empty => new ItemStack { Item = null, Quantity = 0 };

        public bool IsEmpty => Item == null || Quantity <= 0;

        public ItemStack(ItemDefinition item, int quantity)
        {
            Item     = item;
            Quantity = quantity;
        }

        public static bool IsNull(ItemStack stack) => stack.IsEmpty;
    }
}

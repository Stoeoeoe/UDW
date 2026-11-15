using System;
using Core.Inventory;
using VContainer;

namespace Core.Scripting
{
    /// <summary>
    /// The player's bag. A full bag or too few items is a normal outcome that Give and Take report, never an error;
    /// they change nothing then.
    /// </summary>
    [LuaModule("Inventory")]
    public sealed class InventoryLuaApi
    {
        [Inject] private CharacterManager _characters;
        [Inject] private ItemCatalog _items;

        private SlotInventory Bag => _characters.MainCharacter.MainInventory;

        /// <summary>How many of the item the player carries.</summary>
        [LuaCall, Preserve]
        public int Count([LuaResource("item")] string itemId) => Bag.Count(Require(itemId));

        /// <summary>Gives the player the items if they all fit; false when the bag is too full.</summary>
        [LuaCall(writesState: true), Preserve]
        public bool Give([LuaResource("item")] string itemId, double count) => Bag.AddItem(Require(itemId), Quantity(count));

        /// <summary>Takes the items if the player has them all; false when they have too few.</summary>
        [LuaCall(writesState: true), Preserve]
        public bool Take([LuaResource("item")] string itemId, double count) => Bag.TryRemove(Require(itemId), Quantity(count));

        private ItemDefinition Require(string itemId) =>
            _items.Find(itemId) ?? throw new InvalidOperationException($"Unknown or disabled item '{itemId}'.");

        private static int Quantity(double count) =>
            double.IsFinite(count) && count == Math.Truncate(count) && count >= 1 && count <= int.MaxValue
                ? (int)count : throw new ArgumentOutOfRangeException(nameof(count), "The count must be a whole number of at least 1.");
    }
}

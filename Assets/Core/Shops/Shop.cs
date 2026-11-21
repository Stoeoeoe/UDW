using System;
using Core.Common;
using UnityEngine;

namespace Core.Shops
{
    /// <summary>One item a shop sells at a fixed price, always in stock.</summary>
    [Serializable, ImportedData]
    public sealed class ShopOffering
    {
        [field: SerializeField, Validation.Id("The source requires an item ID."), Validation.Reference(typeof(Core.Inventory.ItemDefinition))]
        public string ItemId { get; private set; }
        [field: SerializeField, Validation.Min(0, "Must be nonnegative.")] public int Price { get; private set; }
    }

    /// <summary>A static shop authored in Vulcanus: a fixed list of items at fixed prices, and whether it buys goods.</summary>
    [ImportedData]
    [Core.Catalogs.DefinitionResource]
    public sealed class Shop : Core.Catalogs.DefinitionScriptableObject<ShopValidator>
    {
        [field: SerializeField, Validation.Required("The source requires a display name.")] public string Name { get; private set; }
        /// <summary>Whether the shop pays the item's sell price for the player's goods.</summary>
        [field: SerializeField] public bool BuysGoods { get; private set; }
        [field: SerializeField, Validation.Required("Must not be null; an empty shop is allowed."), Validation.RequiredElements, Validation.Nested]
        public ShopOffering[] Offerings { get; private set; } = Array.Empty<ShopOffering>();
    }
}

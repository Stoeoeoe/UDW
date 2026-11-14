using System;
using Core.Common;
using Newtonsoft.Json;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Core.Shops
{
    /// <summary>One item a shop sells at a fixed price, always in stock.</summary>
    [Serializable]
    public sealed class ShopOffering
    {
        [SerializeField, ReadOnly, Validation.Id("The source requires an item ID.")] private string itemId;
        [SerializeField, ReadOnly, Validation.Min(0, "Must be nonnegative.")] private int price;
        public string ItemId => itemId;
        public int Price => price;
    }

    /// <summary>A static shop authored in Vulcanus: a fixed list of items at fixed prices, and whether it buys goods.</summary>
    public sealed class Shop : ValidatedScriptableObject<ShopValidator>
    {
        [SerializeField, ReadOnly, Validation.NamespacedId("The source requires a lowercase namespace:name ID.", Lowercase = true)] private string id;
        // "name" in JSON; the field can't be called that, it would hide Unity's own Object.name.
        [SerializeField, ReadOnly, JsonProperty("name"), Validation.Required("The source requires a display name.")] private string displayName;
        [SerializeField, ReadOnly] private bool buysGoods;
        [SerializeField, ReadOnly, Validation.Required("Must not be null; an empty shop is allowed."), Validation.RequiredElements, Validation.Nested]
        private ShopOffering[] offerings = Array.Empty<ShopOffering>();

        public string ShopId => id;
        public string DisplayName => displayName;
        /// <summary>Whether the shop pays the item's sell price for the player's goods.</summary>
        public bool BuysGoods => buysGoods;
        public ShopOffering[] Offerings => offerings;
    }
}

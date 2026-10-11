using Core.Common;
using System;
using System.Collections.Generic;
using UnityEngine;
using Core.Inventory;

namespace Core.Shops
{
    public enum ShopRestockMode { Never, Daily }

    [Serializable]
    public sealed class ShopOffering
    {
        [Tooltip("Permanent ID for this offering; keep it unchanged when reordering.")]
        [Validation.Id("Assign a permanent offering ID.")] public string id = Guid.NewGuid().ToString("N");
        [Validation.ValidReference] public ItemDefinition item;
        [Validation.DefinedEnum("Select a defined restock mode.")] public ShopRestockMode restock = ShopRestockMode.Daily;
        [Validation.Range(0, 1)] public float dailyAppearanceChance = 1f;
        [Validation.Min(0, "Must be nonnegative.")] public int minStock = 1;
        [Validation.Range(0, int.MaxValue - 1)] public int maxStock = 5;
        [Validation.Finite, Validation.Min(0)] public float priceMultiplier = 1f;
    }

    /// <summary>Ordered offerings, independent of the NPC or object presenting the shop.</summary>
    [CreateAssetMenu(menuName = "Game/Shop Definition")]
    public sealed class ShopDefinition : ValidatedScriptableObject<ShopDefinitionValidator>
    {
        [SerializeField, Validation.Required("Must not be null; an empty shop is allowed."), Validation.RequiredElements("Offering must not be null."), Validation.Nested]
        private ShopOffering[] offerings = Array.Empty<ShopOffering>();
        [SerializeField, Tooltip("Whether this vendor accepts items with a positive sell base price. No buyback stock is created.")]
        private bool _acceptsSales = true;

        [SerializeField, Validation.Finite, Validation.Min(0)]
        private float _sellPriceMultiplier = 1f;

        public IReadOnlyList<ShopOffering> Offerings => offerings;
        public bool acceptsSales => _acceptsSales;
        public float sellPriceMultiplier => _sellPriceMultiplier;

    }
}

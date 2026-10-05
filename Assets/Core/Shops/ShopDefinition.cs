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
        public string id = Guid.NewGuid().ToString("N");
        public ItemDefinition item;
        public ShopRestockMode restock = ShopRestockMode.Daily;
        [Range(0f, 1f)] public float dailyAppearanceChance = 1f;
        [Min(0)] public int minStock = 1;
        [Min(0)] public int maxStock = 5;
        [Min(0f)] public float priceMultiplier = 1f;
    }

    /// <summary>Ordered offerings, independent of the NPC or object presenting the shop.</summary>
    [CreateAssetMenu(menuName = "Game/Shop Definition")]
    public sealed class ShopDefinition : ScriptableObject
    {
        [SerializeField] private ShopOffering[] offerings = Array.Empty<ShopOffering>();
        public IReadOnlyList<ShopOffering> Offerings => offerings;
        [Tooltip("Whether this vendor accepts items with a positive sell base price. No buyback stock is created.")]
        public bool acceptsSales = true;
        [Min(0f)] public float sellPriceMultiplier = 1f;

#if UNITY_EDITOR
        private void OnValidate()
        {
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (var offering in offerings)
                if (offering == null || string.IsNullOrWhiteSpace(offering.id) || !ids.Add(offering.id) ||
                    !offering.item || offering.minStock < 0 || offering.maxStock < offering.minStock ||
                    offering.maxStock == int.MaxValue || !Enum.IsDefined(typeof(ShopRestockMode), offering.restock) ||
                    offering.dailyAppearanceChance < 0 || offering.dailyAppearanceChance > 1 ||
                    !IsValidMultiplier(offering.dailyAppearanceChance) || !IsValidMultiplier(offering.priceMultiplier))
                {
                    Debug.LogError($"Shop '{name}' has an invalid offering or duplicate offering ID.", this);
                    return;
                }
            if (!IsValidMultiplier(sellPriceMultiplier))
                Debug.LogError($"Shop '{name}' has an invalid sell price multiplier.", this);
        }

        private static bool IsValidMultiplier(float value) => value >= 0 && !float.IsNaN(value) && !float.IsInfinity(value);
#endif
    }
}

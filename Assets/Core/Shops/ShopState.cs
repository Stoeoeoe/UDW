using System;
using System.Collections.Generic;
using Core.Game;
using UnityEngine;

namespace Core.Shops
{
    [Serializable]
    public sealed class ShopStock
    {
        public int quantity;
        public bool available;
        public int lastProcessedDay = -1;
    }

    /// <summary>Saved per vendor instance. No prefab, item asset, or scene references.</summary>
    [Serializable]
    public sealed class ShopState : WorldObjectState
    {
        [SerializeField]
        public Dictionary<string, ShopStock> offerings = new(StringComparer.Ordinal);
    }
}

using System;
using System.Collections.Generic;
using System.Linq;
using Core.Catalogs.Editor;
using Core.Inventory;

namespace Core.Shops.Editor
{
    /// <summary>Shops offer items authored elsewhere; catalog refresh checks that each offered item exists.</summary>
    internal static class ShopCatalogValidation
    {
        public static void Validate(IEnumerable<Shop> shops)
        {
            var itemIds = CatalogAssetDiscovery.Find("Assets", typeof(ItemDefinition)).Cast<ItemDefinition>().Select(item => item.Id).ToHashSet();
            foreach (var shop in shops)
                foreach (var offering in shop.Offerings)
                    if (!itemIds.Contains(offering.ItemId))
                        throw new InvalidOperationException($"Shop '{shop.Id}' offers the unknown item '{offering.ItemId}'.");
        }
    }
}

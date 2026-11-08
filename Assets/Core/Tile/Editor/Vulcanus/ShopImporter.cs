using System.Collections.Generic;
using System.Linq;
using Core.Shops;
using Newtonsoft.Json;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class ShopImporter
    {
        public static void ImportShop(AssetImportContext ctx)
        {
            var shop = CreateShop(VulcanusSchema.Read<ShopDto>(ctx));
            shop.name = shop.DisplayName;
            ctx.AddObjectToAsset("shop", shop);
            ctx.SetMainObject(shop);
        }

        internal static Shop Parse(string json, string schemaPath, string sourcePath) =>
            CreateShop(VulcanusSchema.Deserialize<ShopDto>(json, schemaPath, sourcePath));

        private static Shop CreateShop(ShopDto data)
        {
            var shop = ScriptableObject.CreateInstance<Shop>();
            try
            {
                var offerings = (data.Offerings ?? new List<OfferingDto>()).Select(each => new ShopOffering(each.ItemId, each.Price)).ToArray();
                shop.Configure(data.Id, data.Name, data.BuysGoods, offerings);
                return shop;
            }
            catch { Object.DestroyImmediate(shop); throw; }
        }

        private sealed class ShopDto
        {
            [JsonProperty("id")] public string Id;
            [JsonProperty("name")] public string Name;
            [JsonProperty("buysGoods")] public bool BuysGoods;
            [JsonProperty("offerings")] public List<OfferingDto> Offerings;
        }

        private sealed class OfferingDto
        {
            [JsonProperty("itemId")] public string ItemId;
            [JsonProperty("price")] public int Price;
        }
    }
}

using Core.Shops;
using UnityEditor.AssetImporters;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class ShopImporter
    {
        public static void ImportShop(AssetImportContext ctx) => VulcanusJson.Import<Shop>(ctx, "shop", shop => shop.DisplayName);
    }
}

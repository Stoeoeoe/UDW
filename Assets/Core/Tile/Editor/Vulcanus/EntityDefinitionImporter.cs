using Core.Tile.Vulcanus;
using UnityEditor.AssetImporters;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class EntityDefinitionImporter
    {
        public static void ImportEntityDefinition(AssetImportContext ctx) =>
            VulcanusJson.Import<VulcanEntityDefinition>(ctx, "entityDefinition", entity => VulcanusImportHelpers.GetBaseName(ctx.assetPath));
    }
}

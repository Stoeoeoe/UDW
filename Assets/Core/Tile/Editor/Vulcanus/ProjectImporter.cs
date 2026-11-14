using Core.Tile.Vulcanus;
using UnityEditor.AssetImporters;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>Imports a *.vproj file into a <see cref="VulcanusProject"/>.</summary>
    internal static class ProjectImporter
    {
        public static void ImportProject(AssetImportContext ctx) =>
            VulcanusJson.Import<VulcanusProject>(ctx, "project", _ => VulcanusImportHelpers.GetBaseName(ctx.assetPath));
    }
}

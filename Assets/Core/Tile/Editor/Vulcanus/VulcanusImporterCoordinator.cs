using System;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    [ScriptedImporter(4, new[] { "vproj", "vts", "vmap", "vitm", "entity.json", "runtime.dialogue.json" }, 6100)]
    public class VulcanusImporterCoordinator : ScriptedImporter
    {
        public override void OnImportAsset(AssetImportContext ctx)
        {
            try
            {
                if (ctx.assetPath.EndsWith(".runtime.dialogue.json", StringComparison.OrdinalIgnoreCase))
                {
                    DialogueImporter.ImportDialogue(ctx);
                    return;
                }

                if (ctx.assetPath.EndsWith(".entity.json", StringComparison.OrdinalIgnoreCase))
                {
                    EntityDefinitionImporter.ImportEntityDefinition(ctx);
                    return;
                }

                if (ctx.assetPath.EndsWith(".vproj", StringComparison.OrdinalIgnoreCase))
                {
                    ProjectImporter.ImportProject(ctx);
                    return;
                }

                if (ctx.assetPath.EndsWith(".vts", StringComparison.OrdinalIgnoreCase))
                {
                    TilesetImporter.ImportTileset(ctx);
                    return;
                }

                if (ctx.assetPath.EndsWith(".vmap", StringComparison.OrdinalIgnoreCase))
                {
                    MapImporter.ImportMap(ctx);
                    return;
                }

                if (ctx.assetPath.EndsWith(".vitm", StringComparison.OrdinalIgnoreCase))
                {
                    ItemImporter.ImportItem(ctx);
                    return;
                }

                VulcanusImportHelpers.ImportAsText(ctx);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[VulcanusImporterCoordinator] Failed importing '{ctx.assetPath}'.\n{ex}");
                VulcanusImportHelpers.ImportAsText(ctx);
            }
        }
    }
}

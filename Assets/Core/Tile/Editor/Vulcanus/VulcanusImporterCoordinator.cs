using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    [ScriptedImporter(11, new[] { "vproj", "vts", "vmap", "vitm", "entity.json", "runtime.dialogue.json", "runtime.cutscene.json", "npc.json", "character.json" }, 6100)]
    public class VulcanusImporterCoordinator : ScriptedImporter
    {
        [SerializeField, Range(1, 128), Tooltip("Maximum baked shoreline distance in logical pixels. Appearance widths can change within this range without recalculating distances.")]
        private int shorelineDistancePixels = 32;
        // Declare source-derived artifact dependencies before Unity chooses import order.
        // A fresh project must import its project and tileset assets before its maps.
        internal static string[] GatherDependenciesFromSourceFile(string assetPath)
        {
            var isMap = assetPath.EndsWith(".vmap", StringComparison.OrdinalIgnoreCase);
            var isTileset = assetPath.EndsWith(".vts", StringComparison.OrdinalIgnoreCase);
            if (!isMap && !isTileset) return Array.Empty<string>();
            var dependencies = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                var projectPath = VulcanusImportHelpers.FindProjectAssetPath(assetPath);
                if (!string.IsNullOrEmpty(projectPath)) dependencies.Add(projectPath);
                if (isMap)
                {
                    var paths = VulcanusImportHelpers.BuildTilesetIndex(assetPath, projectPath);
                    var map = VulcanusImportHelpers.LoadDto<MapDto>(assetPath);
                    foreach (var id in map.TilesetRefs)
                        if (!string.IsNullOrWhiteSpace(id) && paths.TryGetValue(id, out var path)) dependencies.Add(path);
                    var triggers = map.SpatialPrimitives?.Triggers;
                    if (triggers != null && triggers.Exists(trigger => trigger.Type == "cutscene"))
                    {
                        var sources = CutsceneImporter.FindSources();
                        foreach (var trigger in triggers)
                            if (trigger.Type == "cutscene" && sources.TryGetValue(trigger.CutsceneId, out var source)) dependencies.Add(source);
                    }
                }
                else
                {
                    var sheet = VulcanusImportHelpers.LoadDto<TilesetDto>(assetPath).SpriteSheet;
                    var path = VulcanusImportHelpers.ResolveAssetReferencePath(assetPath, sheet, projectPath);
                    if (path != null) dependencies.Add(path);
                }
            }
            catch (Exception ex) when (ex is Newtonsoft.Json.JsonException || ex is IOException || ex is InvalidOperationException)
            {
                // OnImportAsset reports malformed or missing required content with its source path.
            }
            var result = new string[dependencies.Count];
            dependencies.CopyTo(result);
            Array.Sort(result, StringComparer.OrdinalIgnoreCase);
            return result;
        }

        public override void OnImportAsset(AssetImportContext ctx)
        {
            try
            {
                if (ctx.assetPath.EndsWith(".runtime.cutscene.json", StringComparison.OrdinalIgnoreCase))
                {
                    CutsceneImporter.ImportCutscene(ctx);
                    return;
                }
                if (ctx.assetPath.EndsWith(".npc.json", StringComparison.OrdinalIgnoreCase) ||
                    ctx.assetPath.EndsWith(".character.json", StringComparison.OrdinalIgnoreCase))
                {
                    CharacterImporter.ImportCharacter(ctx);
                    return;
                }

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
                    MapImporter.ImportMap(ctx, shorelineDistancePixels);
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
                ctx.LogImportError($"[VulcanusImporterCoordinator] Failed importing '{ctx.assetPath}': {ex.Message}");
            }
        }
    }
}

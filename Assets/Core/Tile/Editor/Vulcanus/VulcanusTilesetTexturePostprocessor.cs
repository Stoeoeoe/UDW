using System;
using System.IO;
using UnityEditor;
using UnityEditor.U2D.Aseprite;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>
    /// Configures Aseprite images used as Vulcanus tileset sheets before Unity imports them.
    /// A .vts source refers to an image and assigns tile IDs to cells in its original grid.
    /// For example, tile 1 is the second cell of the first row. Aseprite's animation
    /// import can pack artwork into an atlas, moving those cells. TilesetImporter would
    /// then cut sprites from the wrong positions, producing incorrect or invisible tiles.
    /// </summary>
    internal sealed class VulcanusTilesetTexturePostprocessor : AssetPostprocessor
    {
        private void OnPreprocessAsset()
        {
            // Unity invokes this before importing an asset. Only change Aseprite files
            // referenced by a .vts source; ordinary character animations keep their settings.
            if (assetImporter is not AsepriteImporter aseprite || !IsTilesetSheet(assetPath)) return;

            // Import a sheet rather than an animation atlas, combining the frame's layers
            // into one image. TilesetImporter performs the actual tile-grid slicing later.
            aseprite.importMode = FileImportModes.SpriteSheet;
            aseprite.layerImportMode = LayerImportModes.MergeFrame;

            // Extra space between packed artwork or sprites would shift the grid positions
            // used by the .vts tile IDs, so both kinds of padding must be zero.
            aseprite.mosaicPadding = 0;
            aseprite.spritePadding = 0;

            // TilesetImporter reads texture pixels to detect transparent cells. Enable
            // read/write so those CPU-side reads work. The Aseprite importer exposes this
            // setting through serialized data rather than a public property.
            var settings = new SerializedObject(aseprite);
            settings.FindProperty("m_TextureImporterSettings.m_IsReadable").intValue = 1;
            settings.ApplyModifiedPropertiesWithoutUndo();
        }

        internal static bool IsTilesetSheet(string sheetPath)
        {
            // Being an Aseprite file does not make an image a tileset. A .vts source
            // must explicitly refer to this image through its SpriteSheet field.
            // Inspect source files, not imported objects: this also works on first import
            // and in asset workers, before the .vts artifact is available.
            foreach (var absolutePath in Directory.EnumerateFiles(Application.dataPath, "*.vts", SearchOption.AllDirectories))
            {
                // File enumeration returns absolute paths; import helpers expect
                // Unity asset paths such as Assets/Tilesets/Village.vts.
                var tilesetPath = "Assets" + absolutePath.Substring(Application.dataPath.Length).Replace('\\', '/');
                try
                {
                    var dto = VulcanusImportHelpers.LoadDto<TilesetDto>(tilesetPath);
                    var projectPath = VulcanusImportHelpers.FindProjectAssetPath(tilesetPath);
                    // Use the same owner/project-relative path resolution as the tileset
                    // importer, so matching does not depend on the image's filename alone.
                    var resolved = VulcanusImportHelpers.ResolveAssetReferencePath(tilesetPath, dto.SpriteSheet, projectPath);
                    if (string.Equals(resolved, sheetPath, StringComparison.OrdinalIgnoreCase)) return true;
                }
                catch (Exception ex) when (ex is IOException || ex is Newtonsoft.Json.JsonException || ex is InvalidOperationException)
                {
                    // Malformed tileset sources are diagnosed by their own importer.
                }
            }
            // No tileset references this image, so its importer settings stay untouched.
            return false;
        }
    }
}

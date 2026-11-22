using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using UnityEditor;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>
    /// Finds season twin tilesets. A base tileset bakes its twins' sprites, so adding, removing or relinking a twin
    /// reimports the tilesets through a custom dependency.
    /// </summary>
    internal sealed class SeasonTwins : AssetPostprocessor
    {
        public const string DependencyName = "UrdewValley.Vulcanus.SeasonTwins";
        private static Hash128 _registered;

        /// <summary>The twins of a base tileset: their asset paths and contents.</summary>
        public static List<(string Path, TilesetDto Twin)> Of(string baseTilesetId) =>
            All().Where(entry => entry.Twin.BaseTilesetId == baseTilesetId).ToList();

        private static IEnumerable<(string Path, TilesetDto Twin)> All()
        {
            foreach (var file in Directory.EnumerateFiles(Application.dataPath, "*.vts", SearchOption.AllDirectories)
                         .OrderBy(path => path, StringComparer.OrdinalIgnoreCase))
            {
                TilesetDto dto;
                try { dto = VulcanusImportHelpers.LoadDto<TilesetDto>(file); }
                catch (JsonException) { continue; } // its own import reports it
                if (!string.IsNullOrEmpty(dto?.BaseTilesetId) && VulcanusImportHelpers.TryAbsoluteToAssetPath(file, out var path))
                    yield return (path, dto);
            }
        }

        [InitializeOnLoadMethod]
        private static void Initialize() => Register();

        private static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom)
        {
            if (imported.Concat(deleted).Concat(moved).Concat(movedFrom).Any(path => path.EndsWith(".vts", StringComparison.OrdinalIgnoreCase)) &&
                Register())
                EditorApplication.delayCall += AssetDatabase.Refresh;
        }

        // Records which twins exist; returns whether that changed since the last registration.
        private static bool Register()
        {
            var hash = Hash128.Compute(JsonConvert.SerializeObject(
                All().Select(entry => new { entry.Path, entry.Twin.BaseTilesetId, entry.Twin.Season })));
            if (hash == _registered) return false;
            _registered = hash;
            AssetDatabase.RegisterCustomDependency(DependencyName, hash);
            return true;
        }
    }
}

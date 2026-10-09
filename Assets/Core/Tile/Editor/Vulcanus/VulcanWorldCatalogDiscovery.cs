using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Core.Catalogs.Editor;
using Core.Location;
using Core.Tile.Vulcanus;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    internal sealed class VulcanusWorldCatalogDiscovery : AssetPostprocessor, IPreprocessBuildWithReport
    {
        private static bool _scheduled;
        private static bool _refreshing;
        public int callbackOrder => 10;

        [InitializeOnLoadMethod]
        private static void Initialize()
        {
            Schedule();
            EditorApplication.playModeStateChanged += state =>
            {
                if (state != PlayModeStateChange.ExitingEditMode) return;
                try { RefreshAll(); }
                catch (Exception exception) { Debug.LogError(exception.Message); EditorApplication.isPlaying = false; }
            };
        }

        internal static void Schedule()
        {
            if (_scheduled || _refreshing) return;
            _scheduled = true;
            EditorApplication.delayCall += () =>
            {
                _scheduled = false;
                if (EditorApplication.isPlayingOrWillChangePlaymode) return;
                foreach (var catalog in FindCatalogs())
                    try { Refresh(catalog); }
                    catch (Exception exception) { Debug.LogError(exception.Message, catalog); }
            };
        }

        private static VulcanusWorldCatalog[] FindCatalogs() =>
            CatalogAssetDiscovery.Find("Assets", typeof(VulcanusWorldCatalog)).Cast<VulcanusWorldCatalog>().ToArray();

        private static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom)
        {
            if (_refreshing) return;
            if (imported.Concat(deleted).Concat(moved).Concat(movedFrom).Any(path =>
                path.EndsWith(".vmap", StringComparison.OrdinalIgnoreCase) ||
                path.EndsWith(".vproj", StringComparison.OrdinalIgnoreCase) ||
                (path.EndsWith(".asset", StringComparison.OrdinalIgnoreCase) &&
                 AssetDatabase.LoadAssetAtPath<VulcanusWorldCatalog>(path)))) Schedule();
        }

        internal static void RefreshAll()
        {
            foreach (var catalog in FindCatalogs()) Refresh(catalog);
        }

        public void OnPreprocessBuild(BuildReport report)
        {
            try { RefreshAll(); }
            catch (Exception exception) { throw new BuildFailedException(exception.Message); }
        }

        internal static bool Refresh(VulcanusWorldCatalog catalog)
        {
            if (!catalog || !catalog.Project) return false;
            var previous = catalog.MapBindings;
            var bindings = BuildMapBindings(catalog.Project, previous, out _, out _);
            if (previous.Length == bindings.Length && previous.Zip(bindings, SameBinding).All(equal => equal)) return false;
            _refreshing = true;
            try
            {
                // Automatic map discovery must never reinterpret manually assigned entity prefabs.
                catalog.ApplySyncData(catalog.EntityPrefabMappings, bindings);
                EditorUtility.SetDirty(catalog);
                AssetDatabase.SaveAssetIfDirty(catalog);
            }
            finally { _refreshing = false; }
            return true;
        }

        private static bool SameBinding(VulcanusWorldCatalog.MapBinding a, VulcanusWorldCatalog.MapBinding b) =>
            a != null && b != null && a.MapId == b.MapId && a.MapPrefab == b.MapPrefab &&
            a.LocationData == b.LocationData && a.SourceAssetGuid == b.SourceAssetGuid;

        internal static VulcanusWorldCatalog.MapBinding[] BuildMapBindings(
            VulcanusProject project, VulcanusWorldCatalog.MapBinding[] existingBindings,
            out int discoveredMapCount, out int unresolvedMapPrefabs)
        {
            discoveredMapCount = 0;
            unresolvedMapPrefabs = 0;
            var projectPath = AssetDatabase.GetAssetPath(project);
            var root = Path.GetDirectoryName(VulcanusImportHelpers.ToAbsolutePath(projectPath));
            var existing = Core.Catalogs.IdIndex.FirstWins(existingBindings, binding => binding?.MapId, StringComparer.OrdinalIgnoreCase);
            var result = new List<VulcanusWorldCatalog.MapBinding>();
            var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var file in Directory.GetFiles(root, "*.vmap", SearchOption.AllDirectories).OrderBy(path => path, StringComparer.Ordinal))
            {
                if (!VulcanusImportHelpers.TryAbsoluteToAssetPath(file, out var path)) continue;
                // Nested source projects own their own maps.
                if (!string.Equals(VulcanusImportHelpers.FindProjectAssetPath(path), projectPath, StringComparison.OrdinalIgnoreCase)) continue;
                discoveredMapCount++;
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                var map = prefab ? prefab.GetComponent<VulcanusImportedMap>() : null;
                var location = AssetDatabase.LoadAllAssetsAtPath(path).OfType<LocationData>().FirstOrDefault();
                if (!map || !location || string.IsNullOrWhiteSpace(map.MapId))
                {
                    unresolvedMapPrefabs++;
                    throw new InvalidOperationException($"Cannot refresh world catalog: map '{path}' has not imported successfully.");
                }
                if (!ids.Add(map.MapId)) throw new InvalidOperationException($"Duplicate map ID '{map.MapId}' in project '{projectPath}'.");
                result.Add(new VulcanusWorldCatalog.MapBinding(map.MapId, prefab, location, AssetDatabase.AssetPathToGUID(path)));
                existing.Remove(map.MapId);
            }
            // Only discovered rows have a source GUID. Deleted/moved-out sources disappear;
            // manual rows remain unless the same prefab is now discovered under another ID.
            result.AddRange(existing.Values.Where(binding => binding != null && string.IsNullOrEmpty(binding.SourceAssetGuid) &&
                (!binding.MapPrefab || !result.Any(row => row.MapPrefab == binding.MapPrefab))));
            result.Sort((a, b) => string.Compare(a.MapId, b.MapId, StringComparison.OrdinalIgnoreCase));
            return result.ToArray();
        }
    }

    internal sealed class VulcanusWorldCatalogSaveProcessor : AssetModificationProcessor
    {
        private static string[] OnWillSaveAssets(string[] paths)
        {
            if (paths.Any(path => AssetDatabase.LoadAssetAtPath<VulcanusWorldCatalog>(path)))
                VulcanusWorldCatalogDiscovery.Schedule();
            return paths;
        }
    }
}

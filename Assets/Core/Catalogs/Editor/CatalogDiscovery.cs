using System;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Catalogs.Editor
{
    /// <summary>Shared editor-only discovery and validation, driven by Path and type.</summary>
    internal sealed class CatalogDiscovery : AssetPostprocessor, IPreprocessBuildWithReport
    {
        private static bool _scheduled;
        public int callbackOrder => 0;
        public static DefinitionCatalog[] FindCatalogs() => AssetDatabase.FindAssets("t:DefinitionCatalog")
            .Select(AssetDatabase.GUIDToAssetPath).OrderBy(path => path, StringComparer.Ordinal)
            .Select(AssetDatabase.LoadAssetAtPath<DefinitionCatalog>).Where(catalog => catalog).ToArray();

        public static Object[] Discover(DefinitionCatalog catalog)
        {
            var definitions = CatalogAssetDiscovery.Find(catalog.Path, catalog.DefinitionType);
            CatalogValidation.Validate(catalog, definitions);
            return definitions;
        }

        public static void Refresh(DefinitionCatalog catalog)
        {
            var definitions = Discover(catalog); // Check before changing the previous catalog.
            Undo.RecordObject(catalog, "Refresh catalog");
            if (!catalog.Synchronize(definitions)) { catalog.InvalidateLookup(); return; }
            EditorUtility.SetDirty(catalog);
            AssetDatabase.SaveAssetIfDirty(catalog);
        }

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
            if (_scheduled) return;
            _scheduled = true;
            EditorApplication.delayCall += () =>
            {
                _scheduled = false;
                if (EditorApplication.isPlayingOrWillChangePlaymode) return;
                DefaultCatalogAssets.CreateMissingCatalogs();
                foreach (var catalog in FindCatalogs())
                    try { Refresh(catalog); }
                    catch (Exception exception) { Debug.LogError(exception.Message, catalog); }
            };
        }

        private static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom)
        {
            if (imported.Concat(deleted).Concat(moved).Concat(movedFrom).Any(path =>
                (path.EndsWith(".asset", StringComparison.OrdinalIgnoreCase) ||
                 path.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase) ||
                 path.EndsWith(".npc.json", StringComparison.OrdinalIgnoreCase) ||
                 path.EndsWith(".actor.json", StringComparison.OrdinalIgnoreCase) ||
                 path.EndsWith(".runtime.cutscene.json", StringComparison.OrdinalIgnoreCase) ||
                 path.EndsWith(".vitm", StringComparison.OrdinalIgnoreCase)) &&
                !AssetDatabase.LoadAssetAtPath<DefinitionCatalog>(path))) Schedule();
        }

        public void OnPreprocessBuild(BuildReport report)
        {
            try { RefreshAll(); }
            catch (Exception exception) { throw new BuildFailedException(exception.Message); }
        }

        internal static void RefreshAll()
        {
            DefaultCatalogAssets.CreateMissingCatalogs();
            foreach (var catalog in FindCatalogs()) Refresh(catalog);
        }
    }

    internal sealed class CatalogSaveProcessor : AssetModificationProcessor
    {
        private static string[] OnWillSaveAssets(string[] paths)
        {
            if (paths.Any(path => !AssetDatabase.LoadAssetAtPath<DefinitionCatalog>(path))) CatalogDiscovery.Schedule();
            return paths;
        }
    }
}

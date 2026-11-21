using System;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace Core.Catalogs.Editor
{
    /// <summary>Shared editor-only discovery and validation, driven by Path and type.</summary>
    internal sealed class CatalogDiscovery : AssetPostprocessor, IPreprocessBuildWithReport
    {
        private static bool _scheduled;
        public int callbackOrder => 0;

        public static string DependencyName<T>() where T : Object => DependencyName(typeof(T));
        private static string DependencyName(Type type) => "UrdewValley.Catalog." + DefinitionCatalog.FamilyOf(type).FullName;

        private static void RegisterDependencies(DefinitionCatalog catalog)
        {
            foreach (var type in DefinitionCatalog.DefinitionTypes)
            {
                var choices = catalog.All(type).OrderBy(DefinitionCatalog.GetId, StringComparer.Ordinal)
                    .Select(definition => new { id = DefinitionCatalog.GetId(definition), asset = GlobalObjectId.GetGlobalObjectIdSlow(definition).ToString() });
                AssetDatabase.RegisterCustomDependency(DependencyName(type),
                    Hash128.Compute(Newtonsoft.Json.JsonConvert.SerializeObject(choices)));
            }
        }

        public static Object[] Discover(Type type, string folder = null)
        {
            if (!typeof(Object).IsAssignableFrom(type) || !typeof(IDefinition).IsAssignableFrom(type))
                throw new InvalidOperationException($"Definition resource '{type.FullName}' must be a Unity object implementing IDefinition.");
            return CatalogAssetDiscovery.Find(folder ?? DefinitionCatalog.DiscoveryPath(type), type);
        }

        public static void Refresh(DefinitionCatalog catalog)
        {
            var definitions = DefinitionCatalog.DefinitionTypes.SelectMany(type => Discover(type)).Distinct().ToArray();
            CatalogValidation.Validate(catalog, definitions); // Check before changing the previous catalog.
            Undo.RecordObject(catalog, "Refresh catalog");
            if (catalog.Synchronize(definitions))
            {
                EditorUtility.SetDirty(catalog);
                AssetDatabase.SaveAssetIfDirty(catalog);
            }
            else catalog.InvalidateLookup();
            RegisterDependencies(catalog);
        }

        [InitializeOnLoadMethod]
        private static void Initialize()
        {
            Schedule();
            EditorApplication.playModeStateChanged += state =>
            {
                if (state == PlayModeStateChange.EnteredEditMode)
                    DefaultCatalogAssets.Load().UseTestContent(Array.Empty<Object>());
                if (state != PlayModeStateChange.ExitingEditMode) return;
                try
                {
                    RefreshAll();
                    if (CatalogAssetDiscovery.IsTestContent(SceneManager.GetActiveScene().path)) UseTestContent();
                }
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
                var catalog = DefaultCatalogAssets.Load();
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
                 path.EndsWith(".character.json", StringComparison.OrdinalIgnoreCase) ||
                 path.EndsWith(".apollocue", StringComparison.OrdinalIgnoreCase) ||
                 path.EndsWith(".runtime.cutscene.json", StringComparison.OrdinalIgnoreCase) ||
                 path.EndsWith(".runtime.dialogue.json", StringComparison.OrdinalIgnoreCase) ||
                 path.EndsWith(".vitm", StringComparison.OrdinalIgnoreCase) ||
                 path.EndsWith(".vmap", StringComparison.OrdinalIgnoreCase)))) Schedule();
        }

        public void OnPreprocessBuild(BuildReport report)
        {
            try { RefreshAll(); }
            catch (Exception exception) { throw new BuildFailedException(exception.Message); }
        }

        /// <summary>
        /// A test scene plays with the test project's content in every catalog. Its definitions were checked at import;
        /// the reference checks cover game content only, and a broken test reference fails its test.
        /// </summary>
        private static void UseTestContent()
        {
            var definitions = DefinitionCatalog.DefinitionTypes.SelectMany(CatalogAssetDiscovery.FindTestContent).Distinct().ToArray();
            DefaultCatalogAssets.Load().UseTestContent(definitions);
        }

        internal static void RefreshAll()
        {
            DefaultCatalogAssets.CreateMissingCatalogs();
            Refresh(DefaultCatalogAssets.Load());
            Core.Tile.Editor.Vulcanus.DialogueImporter.ValidateSources();
        }
    }

    internal sealed class CatalogSaveProcessor : AssetModificationProcessor
    {
        private static string[] OnWillSaveAssets(string[] paths)
        {
            if (paths.Length > 0) CatalogDiscovery.Schedule();
            return paths;
        }
    }
}

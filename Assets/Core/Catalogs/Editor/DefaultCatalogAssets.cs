using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace Core.Catalogs.Editor
{
    /// <summary>Only the game's default asset locations. Discovery and selection belong to the shared pipeline.</summary>
    internal static class DefaultCatalogAssets
    {
        public static IReadOnlyList<DefinitionCatalog> CreateMissingCatalogs(string folder = "Assets/Resources")
        {
            if (!AssetDatabase.IsValidFolder(folder))
                AssetDatabase.CreateFolder(Path.GetDirectoryName(folder)?.Replace('\\', '/'), Path.GetFileName(folder));
            var created = new List<DefinitionCatalog>();
            var path = folder + "/" + DefinitionCatalog.ResourceName + ".asset";
            var existing = AssetDatabase.LoadMainAssetAtPath(path);
            if (existing is DefinitionCatalog) return created;
            if (existing) throw new InvalidOperationException($"Cannot create DefinitionCatalog: '{path}' is occupied by another asset.");
            var catalog = ScriptableObject.CreateInstance<DefinitionCatalog>();
            AssetDatabase.CreateAsset(catalog, path);
            created.Add(catalog);
            return created.AsReadOnly();
        }

        internal static DefinitionCatalog Load()
        {
            var catalog = AssetDatabase.LoadAssetAtPath<DefinitionCatalog>(DefinitionCatalog.AssetPath);
            if (!catalog) throw new InvalidOperationException($"The required catalog is missing at '{DefinitionCatalog.AssetPath}'.");
            return catalog;
        }

        [MenuItem("Tools/Catalogs/Create Missing Catalogs")]
        private static void CreateFromMenu()
        {
            var created = CreateMissingCatalogs();
            CatalogDiscovery.Schedule();
            Debug.Log(created.Count == 0 ? "All default catalogs already exist."
                : "Created catalogs:\n" + string.Join("\n", created.Select(AssetDatabase.GetAssetPath)));
        }

    }
}

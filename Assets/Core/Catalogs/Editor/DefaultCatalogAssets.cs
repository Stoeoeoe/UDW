using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
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
            var types = TypeCache.GetTypesWithAttribute<DefaultCatalogAttribute>()
                .OrderBy(type => type.FullName, StringComparer.Ordinal).ToArray();
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var type in types)
            {
                if (!typeof(DefinitionCatalog).IsAssignableFrom(type) || type.IsAbstract || type.ContainsGenericParameters)
                    throw new InvalidOperationException($"Default catalog {type.FullName} must be a concrete DefinitionCatalog.");
                if (!names.Add(type.GetCustomAttribute<DefaultCatalogAttribute>().ResourceName))
                    throw new InvalidOperationException($"Duplicate default catalog resource name on {type.FullName}.");
            }
            foreach (var type in types)
                Create(folder, type, type.GetCustomAttribute<DefaultCatalogAttribute>().ResourceName, created);
            return created.AsReadOnly();
        }

        internal static DefinitionCatalog Load(Type type)
        {
            var declaration = type.GetCustomAttribute<DefaultCatalogAttribute>()
                ?? throw new InvalidOperationException($"{type.Name} has no default catalog declaration.");
            var path = $"Assets/Resources/{declaration.ResourceName}.asset";
            var catalog = (DefinitionCatalog)AssetDatabase.LoadAssetAtPath(path, type);
            if (!catalog) throw new InvalidOperationException($"The required {type.Name} is missing at '{path}'.");
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

        private static void Create(string folder, Type type, string name, List<DefinitionCatalog> created)
        {
            var path = folder + "/" + name + ".asset";
            var existing = AssetDatabase.LoadMainAssetAtPath(path);
            if (existing && existing.GetType() == type) return;
            if (existing) throw new InvalidOperationException($"Cannot create {type.Name}: '{path}' is occupied by another asset.");
            var catalog = (DefinitionCatalog)ScriptableObject.CreateInstance(type);
            AssetDatabase.CreateAsset(catalog, path);
            created.Add(catalog);
        }
    }
}

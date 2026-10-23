using Character;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Core.Divinity;
using Core.Inventory;
using Core.Scripting;
using Interaction.Dialog;
using Plants;
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
            Create<ItemCatalog>(folder, ItemCatalog.ResourceName, created);
            Create<CharacterCatalog>(folder, CharacterCatalog.ResourceName, created);
            Create<CutsceneCatalog>(folder, CutsceneCatalog.ResourceName, created);
            Create<SkillCatalog>(folder, SkillCatalog.ResourceName, created);
            Create<DeityCatalog>(folder, DeityCatalog.ResourceName, created);
            Create<PlantCatalog>(folder, PlantCatalog.ResourceName, created);
            Create<TypewriterSoundCatalog>(folder, TypewriterSoundCatalog.ResourceName, created);
            return created.AsReadOnly();
        }

        [MenuItem("Tools/Catalogs/Create Missing Catalogs")]
        private static void CreateFromMenu()
        {
            var created = CreateMissingCatalogs();
            CatalogDiscovery.Schedule();
            Debug.Log(created.Count == 0 ? "All default catalogs already exist."
                : "Created catalogs:\n" + string.Join("\n", created.Select(AssetDatabase.GetAssetPath)));
        }

        private static void Create<T>(string folder, string name, List<DefinitionCatalog> created) where T : DefinitionCatalog
        {
            var path = folder + "/" + name + ".asset";
            var existing = AssetDatabase.LoadMainAssetAtPath(path);
            if (existing is T) return;
            if (existing) throw new InvalidOperationException($"Cannot create {typeof(T).Name}: '{path}' is occupied by another asset.");
            var catalog = ScriptableObject.CreateInstance<T>();
            AssetDatabase.CreateAsset(catalog, path);
            created.Add(catalog);
        }
    }
}

using System;
using Core.Tile.Editor.Vulcanus;
using Core.Tile.Vulcanus;
using UnityEditor;
using UnityEngine;

namespace Core.Tile.Editor
{
    /// <summary>
    /// The world catalog of the test Vulcanus project, built in memory. Catalog discovery leaves Assets/Tests out, so
    /// the project has no catalog asset of its own. Destroy the result when done.
    /// </summary>
    internal static class TestWorld
    {
        public const string ProjectPath = "Assets/Tests/Vulcanus/vulcan.vproj";

        public static VulcanusWorldCatalog Create()
        {
            var project = AssetDatabase.LoadAssetAtPath<VulcanusProject>(ProjectPath);
            var catalog = ScriptableObject.CreateInstance<VulcanusWorldCatalog>();
            catalog.ApplySyncData(Array.Empty<VulcanusProject.EntityPrefabMapping>(),
                VulcanusWorldCatalogDiscovery.BuildMapBindings(project, Array.Empty<VulcanusWorldCatalog.MapBinding>(), out _, out _));
            return catalog;
        }
    }
}

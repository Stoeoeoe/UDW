using System;
using System.Linq;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Catalogs.Editor
{
    /// <summary>Editor-only folder loading, also usable without inheriting DefinitionCatalog.</summary>
    internal static class CatalogAssetDiscovery
    {
        /// <summary>Test fixtures, such as the test Vulcanus project. Never part of the game: catalogs skip it.</summary>
        public const string TestFolder = "Assets/Tests";

        public static bool IsTestContent(string assetPath) =>
            assetPath.StartsWith(TestFolder + "/", StringComparison.OrdinalIgnoreCase);

        public static Object[] Find(string folder, Type type) => Find(folder, type, path => !IsTestContent(path));

        /// <summary>The test project's definitions of a type, for playing a test scene.</summary>
        public static Object[] FindTestContent(Type type) => Find(TestFolder, type, IsTestContent);

        private static Object[] Find(string folder, Type type, Func<string, bool> include)
        {
            if (!AssetDatabase.IsValidFolder(folder))
                throw new InvalidOperationException($"Discovery folder does not exist: {folder}");
            var component = typeof(Component).IsAssignableFrom(type);
            return AssetDatabase.FindAssets(component ? "t:Prefab" : "t:" + type.Name, new[] { folder })
                .Select(AssetDatabase.GUIDToAssetPath).Where(include).OrderBy(path => path, StringComparer.Ordinal)
                .Select(path => component
                    ? (Object)AssetDatabase.LoadAssetAtPath<GameObject>(path)?.GetComponent(type)
                    : AssetDatabase.LoadAssetAtPath(path, type)).Where(asset => asset).ToArray();
        }
    }
}

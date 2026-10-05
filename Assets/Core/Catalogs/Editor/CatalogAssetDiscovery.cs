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
        public static Object[] Find(string folder, Type type)
        {
            if (!AssetDatabase.IsValidFolder(folder))
                throw new InvalidOperationException($"Discovery folder does not exist: {folder}");
            var component = typeof(Component).IsAssignableFrom(type);
            return AssetDatabase.FindAssets(component ? "t:Prefab" : "t:" + type.Name, new[] { folder })
                .Select(AssetDatabase.GUIDToAssetPath).OrderBy(path => path, StringComparer.Ordinal)
                .Select(path => component
                    ? (Object)AssetDatabase.LoadAssetAtPath<GameObject>(path)?.GetComponent(type)
                    : AssetDatabase.LoadAssetAtPath(path, type)).Where(asset => asset).ToArray();
        }
    }
}

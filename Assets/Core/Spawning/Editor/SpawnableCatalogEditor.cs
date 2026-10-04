using System;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Core.Spawning.Editor
{
    /// <summary>Authoring-time refresh and validation; runtime only reads the serialized catalog.</summary>
    internal sealed class SpawnableCatalogEditor : IPreprocessBuildWithReport
    {
        public int callbackOrder => 0;
        internal const string CatalogPath = "Assets/Content/SpawnableCatalog.asset";
        
        [InitializeOnLoadMethod]
        private static void HookPlayMode() => EditorApplication.playModeStateChanged += state =>
        {
            if (state == PlayModeStateChange.ExitingEditMode) RefreshAll();
        };

        [MenuItem("Tools/Spawning/Refresh Catalogs")]
        private static void RefreshAll()
        {
            foreach (var catalog in AssetDatabase.FindAssets("t:SpawnableCatalog")
                         .Select(g => AssetDatabase.LoadAssetAtPath<SpawnableCatalog>(AssetDatabase.GUIDToAssetPath(g))))
                Refresh(catalog);
            AssetDatabase.SaveAssets();
        }

        public void OnPreprocessBuild(BuildReport report)
        {
            RefreshAll();
            foreach (var guid in AssetDatabase.FindAssets("t:SpawnableCatalog"))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (!AssetDatabase.LoadAssetAtPath<SpawnableCatalog>(path).HasValidIds)
                    throw new BuildFailedException($"Invalid Spawnable Catalog '{path}'.");
            }
        }

        internal static void Refresh(SpawnableCatalog catalog)
        {
            // Mirror Odin's AssetList explicitly: its AutoPopulate only runs when drawn.
            var prefabs = AssetDatabase.IsValidFolder(SpawnableCatalog.PrefabFolder)
                ? AssetDatabase.FindAssets("t:Prefab", new[] { SpawnableCatalog.PrefabFolder })
                    .Select(AssetDatabase.GUIDToAssetPath).OrderBy(p => p, StringComparer.Ordinal)
                    .Select(AssetDatabase.LoadAssetAtPath<GameObject>)
                    .Select(p => p.GetComponent<SpawnedObject>()).Where(p => p).ToArray()
                : Array.Empty<SpawnedObject>();
            if (catalog.Prefabs.SequenceEqual(prefabs)) return;
            var serialized = new SerializedObject(catalog);
            var list = serialized.FindProperty("prefabs");
            list.arraySize = prefabs.Length;
            for (var i = 0; i < prefabs.Length; i++)
                list.GetArrayElementAtIndex(i).objectReferenceValue = prefabs[i];
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(catalog);
        }
    }
}

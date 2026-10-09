using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>
    /// After a .vmap is imported, ensures a corresponding scene exists containing the map
    /// prefab and is registered in Build Settings. The scene is created exactly once and never
    /// touched again — the map prefab is the authoritative source of content.
    /// </summary>
    internal class VulcanusMapScenePostprocessor : AssetPostprocessor
    {
        private const string SceneOutputFolder = "Assets/Scenes/Maps";

        internal static string GetScenePath(string mapAssetPath) =>
            $"{SceneOutputFolder}/{Path.GetFileNameWithoutExtension(mapAssetPath)}.unity";

        static void OnPostprocessAllAssets(
            string[] importedAssets,
            string[] deletedAssets,
            string[] movedAssets,
            string[] movedFromAssetPaths)
        {
            var mapAssets = importedAssets
                .Where(p => p.EndsWith(".vmap", System.StringComparison.OrdinalIgnoreCase))
                .ToArray();

            if (mapAssets.Length == 0)
                return;

            var scenesAdded = false;

            foreach (var mapAssetPath in mapAssets)
            {
                var mapPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(mapAssetPath);
                if (mapPrefab == null)
                    continue;

                var scenePath = GetScenePath(mapAssetPath);

                // Never touch an existing scene.
                if (File.Exists(Path.GetFullPath(scenePath)))
                {
                    // Repair registration without rewriting authored scene contents.
                    scenesAdded |= EnsureInBuildSettings(scenePath);
                    continue;
                }

                if (!AssetDatabase.IsValidFolder(SceneOutputFolder))
                    CreateFolderRecursive(SceneOutputFolder);

                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);

                try
                {
                    // Place the imported prefab inside the generated wrapper.
                    var instance = (GameObject)PrefabUtility.InstantiatePrefab(mapPrefab, scene);
                    instance.name = mapPrefab.name;
                    if (!EditorSceneManager.SaveScene(scene, scenePath))
                        throw new System.InvalidOperationException($"Could not save map scene '{scenePath}'.");
                }
                finally { EditorSceneManager.CloseScene(scene, true); }

                AssetDatabase.ImportAsset(scenePath);
                scenesAdded |= EnsureInBuildSettings(scenePath);

                Debug.Log($"[VulcanusMapScenePostprocessor] Created scene '{scenePath}' for map '{mapAssetPath}'.");
            }

            if (scenesAdded)
                Debug.Log("[VulcanusMapScenePostprocessor] Build Settings updated with new map scenes.");
        }

        private static bool EnsureInBuildSettings(string scenePath)
        {
            var existing = EditorBuildSettings.scenes;
            if (existing.Any(s => s.path == scenePath))
                return false;

            EditorBuildSettings.scenes = existing
                .Append(new EditorBuildSettingsScene(scenePath, true))
                .ToArray();
            return true;
        }

        private static void CreateFolderRecursive(string folderPath)
        {
            var parts = folderPath.Split('/');
            var current = parts[0]; // "Assets"
            for (var i = 1; i < parts.Length; i++)
            {
                var next = current + "/" + parts[i];
                if (!AssetDatabase.IsValidFolder(next))
                    AssetDatabase.CreateFolder(current, parts[i]);
                current = next;
            }
        }
    }
}

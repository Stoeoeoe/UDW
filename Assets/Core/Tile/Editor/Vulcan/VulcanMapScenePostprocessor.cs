using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Core.Tile.Editor.Vulcan
{
    /// <summary>
    /// After a .vmap is imported, ensures a corresponding scene exists containing the map
    /// prefab and is registered in Build Settings. The scene is created exactly once and never
    /// touched again — the map prefab is the authoritative source of content.
    /// </summary>
    internal class VulcanMapScenePostprocessor : AssetPostprocessor
    {
        private const string SceneOutputFolder = "Assets/Scenes/Maps";

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

                // Name is set to mapId/mapName during import by VulcanJsonImporter.
                var mapId = mapPrefab.name.Replace(".vmap", "");
                var scenePath = $"{SceneOutputFolder}/{mapId}.unity";

                // Never touch an existing scene.
                if (File.Exists(Path.GetFullPath(scenePath)))
                    continue;

                if (!AssetDatabase.IsValidFolder(SceneOutputFolder))
                    CreateFolderRecursive(SceneOutputFolder);

                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);

                // Place the map prefab inside the scene so it isn't empty and is visible in-editor.
                var instance = (GameObject)PrefabUtility.InstantiatePrefab(mapPrefab, scene);
                instance.name = mapPrefab.name;

                EditorSceneManager.SaveScene(scene, scenePath);
                EditorSceneManager.CloseScene(scene, true);

                AssetDatabase.ImportAsset(scenePath);

                scenesAdded |= EnsureInBuildSettings(scenePath);

                Debug.Log($"[VulcanMapScenePostprocessor] Created scene '{scenePath}' for map '{mapId}'.");
            }

            if (scenesAdded)
                Debug.Log("[VulcanMapScenePostprocessor] Build Settings updated with new map scenes.");
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

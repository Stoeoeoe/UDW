using System.Collections.Generic;
using System.Linq;
using Plants;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Interaction.Editor
{
    /// <summary>
    /// Checks interaction targeting setup before Play Mode and builds: button-press interactables sit on the
    /// Interactable layer, and the art the pointer hovers and the outline draws is readable, one quad per sprite
    /// (Full Rect) and on the default lit sprite material. Crop art comes from plant data, so plants are checked too.
    /// </summary>
    public sealed class InteractableConfigurationValidation : IPreprocessBuildWithReport, IProcessSceneWithReport
    {
        private const string DefaultSpriteShader = "Universal Render Pipeline/2D/Sprite-Lit-Default";
        private static readonly string[] PrefabFolders =
            { "Assets/Content", "Assets/Core", "Assets/Interaction", "Assets/Character", "Assets/Plants", "Assets/Resources" };

        public int callbackOrder => -780;

        public static List<string> Check(GameObject root)
        {
            var errors = new List<string>();
            var layer = LayerMask.NameToLayer("Interactable");
            foreach (var interactable in root.GetComponentsInChildren<AbstractInteractable>(true))
            {
                if (interactable.RequiresButtonPress && interactable.gameObject.layer != layer)
                    errors.Add($"Interactable '{interactable.name}' needs a button press, so it must be on the Interactable layer.");
                var target = (Transform)new SerializedObject(interactable).FindProperty("target").objectReferenceValue;
                if (!target) continue;
                foreach (var sprite in target.GetComponentsInChildren<SpriteRenderer>(true))
                    CheckSprite(sprite, $"Interactable '{interactable.name}'", errors);
            }
            return errors;
        }

        public static List<string> CheckPlants()
        {
            var errors = new List<string>();
            foreach (var guid in AssetDatabase.FindAssets("t:" + nameof(PlantData)))
            {
                var plant = AssetDatabase.LoadAssetAtPath<PlantData>(AssetDatabase.GUIDToAssetPath(guid));
                var representations = plant.GrowthStages.Select(stage => stage.Representation).Append(plant.WiltedRepresentation);
                foreach (var representation in representations.Where(each => each != null))
                {
                    if (representation.sprite) CheckArt(representation.sprite, $"Crop '{plant.name}'", errors);
                    if (representation.prefab)
                        foreach (var sprite in representation.prefab.GetComponentsInChildren<SpriteRenderer>(true))
                            CheckSprite(sprite, $"Crop '{plant.name}'", errors);
                }
            }
            return errors;
        }

        public static List<string> CheckPrefabs()
        {
            var errors = new List<string>();
            foreach (var guid in AssetDatabase.FindAssets("t:Prefab", PrefabFolders))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                foreach (var error in Check(AssetDatabase.LoadAssetAtPath<GameObject>(path)))
                    errors.Add($"{path}: {error}");
            }
            errors.AddRange(CheckPlants());
            return errors;
        }

        private static void CheckSprite(SpriteRenderer renderer, string owner, List<string> errors)
        {
            if (!renderer.sprite) return; // Empty visual slots are filled at runtime (forage variants, animation).
            if (!renderer.sharedMaterial || renderer.sharedMaterial.shader.name != DefaultSpriteShader)
                errors.Add($"{owner}: sprite '{renderer.name}' must use the default lit sprite material to be highlighted.");
            CheckArt(renderer.sprite, owner, errors);
        }

        // Every sprite of the texture, so all animation frames of a sheet are covered.
        private static void CheckArt(Sprite sprite, string owner, List<string> errors)
        {
            var texture = sprite.texture;
            var path = AssetDatabase.GetAssetPath(texture);
            if (!texture.isReadable)
                errors.Add($"{owner}: texture '{path}' needs Read/Write enabled so the pointer can hover it.");
            var sprites = string.IsNullOrEmpty(path) || AssetDatabase.IsSubAsset(texture)
                ? new[] { sprite }
                : AssetDatabase.LoadAllAssetsAtPath(path).OfType<Sprite>().ToArray();
            if (sprites.Any(each => each.vertices.Length != 4))
                errors.Add($"{owner}: texture '{path}' must use the Full Rect sprite mesh type so the outline fits.");
        }

        [InitializeOnLoadMethod]
        private static void Initialize()
        {
            EditorApplication.playModeStateChanged += state =>
            {
                if (state != PlayModeStateChange.ExitingEditMode) return;
                var errors = CheckPrefabs();
                for (var i = 0; i < SceneManager.sceneCount; i++)
                    foreach (var root in SceneManager.GetSceneAt(i).GetRootGameObjects()) errors.AddRange(Check(root));
                if (errors.Count == 0) return;
                Debug.LogError("Invalid interactable configuration:\n" + string.Join("\n", errors.Distinct()));
                EditorApplication.isPlaying = false;
            };
        }

        public void OnPreprocessBuild(BuildReport report)
        {
            var errors = CheckPrefabs();
            if (errors.Count > 0) throw new BuildFailedException(string.Join("\n", errors.Distinct()));
        }

        public void OnProcessScene(Scene scene, BuildReport report)
        {
            if (report == null) return; // Runtime-created test scenes are checked at their own setup.
            var errors = scene.GetRootGameObjects().SelectMany(Check).ToList();
            if (errors.Count > 0) throw new BuildFailedException(string.Join("\n", errors.Distinct()));
        }
    }
}

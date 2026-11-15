using System;
using System.Linq;
using Character;
using Character.Animations;
using Core.Inventory;
using Core.Spawning;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Core.Items.Editor
{
    /// <summary>Validates authored forage data before Play Mode/builds.</summary>
    public sealed class PickupConfigurationValidation : IPreprocessBuildWithReport, IProcessSceneWithReport
    {
        public int callbackOrder => -790;

        public static void Check(GameObject root)
        {
            foreach (var spot in root.GetComponentsInChildren<ForagingSpot>(true))
            {
                if (!float.IsFinite(spot.DailySpawnChance) || spot.DailySpawnChance < 0f || spot.DailySpawnChance > 1f)
                    throw new InvalidOperationException($"Foraging spot '{spot.name}' needs a chance between 0 and 1.");
                var entries = spot.Forage.Entries;
                if (entries.Count == 0 || entries.Any(entry => entry == null || !entry.item ||
                        !float.IsFinite(entry.weight) || entry.weight < 0f) ||
                    !float.IsFinite(entries.Sum(entry => entry.weight)) || entries.Sum(entry => entry.weight) <= 0f)
                    throw new InvalidOperationException($"Foraging spot '{spot.name}' needs forage items with nonnegative weights and a positive finite total.");
                var catalog = AssetDatabase.LoadAssetAtPath<SpawnableCatalog>("Assets/Resources/SpawnableCatalog.asset");
                foreach (var entry in entries)
                    if (!catalog.Prefabs.Contains(entry.item))
                        throw new InvalidOperationException($"Foraging spot '{spot.name}' references unregistered forage '{entry.item.name}'.");
            }
            foreach (var pickup in root.GetComponentsInChildren<PickupableInteractable>(true))
            {
                CheckItem(pickup.Item);
                var data = new SerializedObject(pickup);
                if (data.FindProperty("quantity").intValue <= 0)
                    throw new InvalidOperationException($"Pickup '{pickup.name}' needs positive quantity.");
                var animation = (CharacterAnimation)data.FindProperty("pickupAnimation").objectReferenceValue;
                AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Character/Player/TestCharacter.prefab")
                    .GetComponent<GameCharacter>().Animator.ValidateOneShot(animation);
            }
        }

        public static void CheckItem(ForageableItem item)
        {
            item.RequireValidConfiguration();
            if (Resources.Load<ItemCatalog>(ItemCatalog.ResourceName).Find(item.Id) != item)
                throw new InvalidOperationException($"Forage '{item.name}' must be enabled in the item catalog.");
            AssetDatabase.LoadAssetAtPath<GameObject>(SystemRoot.PrefabPath)
                .GetComponent<SystemRoot>().Items.RequirePickupSound(item.PickupSound);
        }

        public static void CheckPrefabs()
        {
            foreach (var guid in AssetDatabase.FindAssets("t:Prefab", new[] { "Assets/Content/Spawnables" }))
                Check(AssetDatabase.LoadAssetAtPath<GameObject>(AssetDatabase.GUIDToAssetPath(guid)));
        }

        [InitializeOnLoadMethod]
        private static void Initialize() => EditorApplication.playModeStateChanged += state =>
        {
            if (state != PlayModeStateChange.ExitingEditMode) return;
            try
            {
                CheckPrefabs();
                for (var i = 0; i < SceneManager.sceneCount; i++)
                    foreach (var root in SceneManager.GetSceneAt(i).GetRootGameObjects()) Check(root);
            }
            catch (Exception error) { Debug.LogError(error.Message); EditorApplication.isPlaying = false; }
        };

        public void OnPreprocessBuild(BuildReport report)
        {
            try { CheckPrefabs(); }
            catch (Exception error) { throw new BuildFailedException(error.Message); }
        }

        public void OnProcessScene(Scene scene, BuildReport report)
        {
            if (report == null) return;
            foreach (var root in scene.GetRootGameObjects()) Check(root);
        }
    }
}

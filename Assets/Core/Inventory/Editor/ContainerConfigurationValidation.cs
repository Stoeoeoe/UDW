using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Interaction;
using UI.Containers;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Core.Inventory.Editor
{
    public sealed class ContainerConfigurationValidation : IPreprocessBuildWithReport, IProcessSceneWithReport
    {
        public int callbackOrder => -800;

        public static void Check(GameObject root)
        {
            foreach (var container in root.GetComponentsInChildren<PersistentContainer>(true))
            {
                container.ValidateConfiguration();
                if (CharacterCatalog.Require(container.Owner.CharacterId) != container.Owner)
                    throw new InvalidOperationException($"Container '{container.name}' requires an enabled, registered owner.");
                var interactable = container.GetComponent<ContainerInteractable>();
                if (!interactable) throw new InvalidOperationException($"Container '{container.name}' requires its interaction component.");
                interactable.ValidateConfiguration();
            }
            foreach (var screen in root.GetComponentsInChildren<ContainerScreen>(true)) screen.ValidateConfiguration();
        }

        public static void CheckPrefabs()
        {
            foreach (var guid in AssetDatabase.FindAssets("t:Prefab", new[]{"Assets/Content/Spawnables"}))
                Check(AssetDatabase.LoadAssetAtPath<GameObject>(AssetDatabase.GUIDToAssetPath(guid)));
            var systems = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Resources/SystemRoot.prefab");
            if (!systems || systems.GetComponentsInChildren<ContainerScreen>(true).Length != 1)
                throw new InvalidOperationException("SystemRoot requires exactly one configured container screen.");
            Check(systems);
        }

        [InitializeOnLoadMethod]
        private static void Initialize() => EditorApplication.playModeStateChanged += state =>
        {
            if (state != PlayModeStateChange.ExitingEditMode) return;
            try
            {
                CheckPrefabs();
                for (int i=0; i<SceneManager.sceneCount; i++)
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

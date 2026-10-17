using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Character.Editor
{
    /// <summary>Checks authored character composition before gameplay and when processing build scenes.</summary>
    public sealed class CharacterConfigurationValidation : IPreprocessBuildWithReport, IProcessSceneWithReport
    {
        public int callbackOrder => -900;

        public static List<string> Check(GameObject root)
        {
            var errors = new List<string>();
            foreach (var character in root.GetComponentsInChildren<GameCharacter>(true))
            {
                try { character.ValidateConfiguration(); }
                catch (InvalidOperationException error) { errors.Add(error.Message); }
            }
            return errors;
        }

        public static List<string> CheckPrefabs()
        {
            var errors = new List<string>();
            foreach (var guid in AssetDatabase.FindAssets("t:Prefab", new[] { "Assets/Character" }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                foreach (var error in Check(AssetDatabase.LoadAssetAtPath<GameObject>(path)))
                    errors.Add($"{path}: {error}");
            }
            return errors;
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
                Debug.LogError("Invalid character configuration:\n" + string.Join("\n", errors));
                EditorApplication.isPlaying = false;
            };
        }

        public void OnPreprocessBuild(BuildReport report)
        {
            var errors = CheckPrefabs();
            if (errors.Count > 0) throw new BuildFailedException(string.Join("\n", errors));
        }

        public void OnProcessScene(Scene scene, BuildReport report)
        {
            if (report == null) return; // Runtime-created test scenes validate at their explicit binding boundary.
            foreach (var root in scene.GetRootGameObjects())
            {
                var errors = Check(root);
                if (errors.Count > 0) throw new BuildFailedException(string.Join("\n", errors));
            }
        }
    }
}

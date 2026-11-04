using System;
using System.Collections.Generic;
using Core;
using UI.Hotbar;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace UI.Shared.Editor
{
    [InitializeOnLoad]
    public static class CutsceneHudSetup
    {
        static CutsceneHudSetup() => EditorApplication.playModeStateChanged += state =>
        {
            if (state != PlayModeStateChange.ExitingEditMode) return;
            var errors = Validate(AssetDatabase.LoadAssetAtPath<GameObject>(SystemRoot.PrefabPath));
            if (errors.Count == 0) return;
            EditorApplication.isPlaying = false;
            Debug.LogError(string.Join("\n", errors));
        };

        public static List<string> Validate(GameObject root)
        {
            var errors = new List<string>();
            if (!root) { errors.Add("Cutscene HUD fading requires Resources/SystemRoot.prefab."); return errors; }
            var manager = root.GetComponent<UrGUIManager>();
            if (!manager) { errors.Add("SystemRoot requires UrGUIManager."); return errors; }
            var group = new SerializedObject(manager).FindProperty("toolHud").objectReferenceValue as CanvasGroup;
            if (!group || !group.GetComponent<ToolHotbar>())
                errors.Add("UrGUIManager requires the ToolHotbar CanvasGroup. Run Tools > UI > Set Up Cutscene HUD Fade.");
            var document = root.GetComponent<UIDocument>();
            if (!document || !document.visualTreeAsset || document.visualTreeAsset.CloneTree().Q("gameHud") == null)
                errors.Add("SystemRoot's UI document requires its gameHud root.");
            return errors;
        }

        [MenuItem("Tools/UI/Set Up Cutscene HUD Fade")]
        public static void Configure()
        {
            const string path = SystemRoot.PrefabPath;
            var root = PrefabUtility.LoadPrefabContents(path);
            try
            {
                var manager = root.GetComponent<UrGUIManager>()
                    ?? throw new InvalidOperationException("SystemRoot requires UrGUIManager.");
                var hotbar = root.transform.Find("Main Camera/UICamera/Canvas/ToolHotbar")
                    ?? throw new InvalidOperationException("SystemRoot requires its ToolHotbar.");
                var group = hotbar.GetComponent<CanvasGroup>();
                if (!group) group = hotbar.gameObject.AddComponent<CanvasGroup>();
                group.alpha = 1;
                group.interactable = group.blocksRaycasts = true;
                var serialized = new SerializedObject(manager);
                serialized.FindProperty("toolHud").objectReferenceValue = group;
                serialized.ApplyModifiedPropertiesWithoutUndo();
                PrefabUtility.SaveAsPrefabAsset(root, path);
            }
            finally { PrefabUtility.UnloadPrefabContents(root); }
        }
    }
}

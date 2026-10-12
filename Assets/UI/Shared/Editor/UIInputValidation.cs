using System.Collections.Generic;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;

namespace UI.Shared.Editor
{
    public sealed class UIInputValidation : IPreprocessBuildWithReport
    {
        public int callbackOrder => 0;
        public static List<string> Check(InputSystemUIInputModule module)
        {
            var errors = new List<string>();
            if (!module || !module.enabled) return errors;
            void CheckAction(string name, InputActionReference reference)
            {
                if (!reference || reference.action == null || reference.action.bindings.Count == 0)
                    errors.Add($"{module.name}: UI {name} has no bound input action.");
                else if (reference.action.actionMap?.asset != module.actionsAsset)
                    errors.Add($"{module.name}: UI {name} references a different action asset.");
            }
            CheckAction("Point", module.point); CheckAction("Click", module.leftClick);
            CheckAction("RightClick", module.rightClick); CheckAction("Navigate", module.move);
            CheckAction("Submit", module.submit); CheckAction("Cancel", module.cancel);
            CheckAction("ScrollWheel", module.scrollWheel);
            return errors;
        }
        public void OnPreprocessBuild(BuildReport report)
        {
            var root = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Resources/SystemRoot.prefab");
            var module = root ? root.GetComponentInChildren<InputSystemUIInputModule>(true) : null;
            if (!module) throw new BuildFailedException("SystemRoot is missing its UI input module.");
            var errors = Check(module);
            if (errors.Count > 0) throw new BuildFailedException(string.Join("\n", errors));
        }
        [MenuItem("Tools/UI/Validate Input Wiring")]
        private static void ValidateLoadedScenes()
        {
            var systems = Object.FindObjectsByType<UnityEngine.EventSystems.EventSystem>(FindObjectsSortMode.None);
            if (systems.Length > 1) Debug.LogError("Multiple active EventSystems are present. Keep one shared UI input owner.");
            foreach (var module in Object.FindObjectsByType<InputSystemUIInputModule>(FindObjectsSortMode.None))
                foreach (var error in Check(module)) Debug.LogError(error, module);
        }
    }
}

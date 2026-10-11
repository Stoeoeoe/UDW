using UnityEditor;
using UnityEngine;

namespace Core.Common.Editor
{
    [CustomEditor(typeof(ValidatedScriptableObject), true), CanEditMultipleObjects]
    public sealed class ValidatedScriptableObjectInspector : UnityEditor.Editor
    {
        public override void OnInspectorGUI()
        {
            DrawDefaultInspector();
            foreach (var asset in targets)
                foreach (var error in ((ValidatedScriptableObject)asset).ValidateConfiguration())
                    EditorGUILayout.HelpBox(error.ToString(), MessageType.Error);

            EditorGUILayout.Space();
            if (GUILayout.Button("Validate"))
            {
                foreach (var target in targets)
                {
                    var asset = (ValidatedScriptableObject)target;
                    var errors = asset.ValidateConfiguration();
                    foreach (var error in errors)
                        Debug.LogFormat(LogType.Error, LogOption.NoStacktrace, error.Asset, "{0}", error);
                    if (errors.Count == 0)
                        Debug.LogFormat(LogType.Log, LogOption.NoStacktrace, asset,
                            "{0}: configuration validation passed.", asset.name);
                }
            }
        }
    }
}

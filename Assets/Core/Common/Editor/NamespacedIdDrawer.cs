using System;
using System.Linq;
using Sirenix.OdinInspector.Editor;
using Sirenix.Utilities.Editor;
using UnityEditor;
using UnityEngine;

namespace Core.Common.Editor
{
    [CustomPropertyDrawer(typeof(NamespacedIdAttribute))]
    internal sealed class NamespacedIdDrawer : PropertyDrawer
    {
        public override void OnGUI(Rect position, SerializedProperty property, GUIContent label)
        {
            if (property.propertyType != SerializedPropertyType.String)
            {
                EditorGUI.LabelField(position, label.text, "NamespacedId requires a string.");
                return;
            }

            using (new EditorGUI.PropertyScope(position, label, property))
            {
                var field = EditorGUI.PrefixLabel(position, label);
                var oldIndent = EditorGUI.indentLevel;
                var oldMixed = EditorGUI.showMixedValue;
                EditorGUI.indentLevel = 0;
                try
                {
                    Split(property.stringValue, out var ns, out var id);
                    var nsRect = new Rect(field.x, field.y, Mathf.Min(140f, field.width * 0.4f), field.height);
                    var menuRect = new Rect(nsRect.xMax - 18f, field.y, 18f, field.height);
                    nsRect.width -= 18f;
                    var colonRect = new Rect(menuRect.xMax + 2f, field.y, 10f, field.height);
                    var idRect = new Rect(colonRect.xMax + 2f, field.y, Mathf.Max(0f, field.xMax - colonRect.xMax - 2f), field.height);
                    EditorGUI.showMixedValue = property.hasMultipleDifferentValues;
                    EditorGUI.BeginChangeCheck();
                    var newNamespace = SirenixEditorFields.TextField(nsRect, ns);
                    var namespaceChanged = EditorGUI.EndChangeCheck();
                    if (EditorGUI.DropdownButton(menuRect, GUIContent.none, FocusType.Keyboard))
                        ShowNamespaces(menuRect, property, ns);
                    EditorGUI.LabelField(colonRect, ":");
                    EditorGUI.BeginChangeCheck();
                    var newId = SirenixEditorFields.TextField(idRect, id);
                    var idChanged = EditorGUI.EndChangeCheck();
                    // Drawing an empty or legacy ID must never mutate its serialized value.
                    if (namespaceChanged || idChanged)
                        AssignParts(property.serializedObject.targetObjects, property.propertyPath,
                            namespaceChanged ? newNamespace : null, idChanged ? newId : null);
                }
                finally
                {
                    EditorGUI.indentLevel = oldIndent;
                    EditorGUI.showMixedValue = oldMixed;
                }
            }
        }

        private void ShowNamespaces(Rect rect, SerializedProperty property, string current)
        {
            var choices = new[] { NamespacedIdAttribute.DefaultNamespace, current }
                .Concat(((NamespacedIdAttribute)attribute).SuggestedNamespaces)
                .Where(s => !string.IsNullOrEmpty(s)).Distinct(StringComparer.Ordinal).ToArray();
            var targets = property.serializedObject.targetObjects;
            var path = property.propertyPath;
            var selector = new GenericSelector<string>("Namespace", false, choices);
            selector.EnableSingleClickToSelect();
            selector.SetSelection(current);
            selector.SelectionConfirmed += selected =>
            {
                var ns = selected.FirstOrDefault();
                if (ns != null) AssignParts(targets, path, ns, null);
            };
            selector.ShowInPopup(rect, 220f);
        }

        internal static void Split(string value, out string ns, out string id)
        {
            value ??= string.Empty;
            var colon = value.IndexOf(':');
            ns = colon < 0 ? NamespacedIdAttribute.DefaultNamespace : value.Substring(0, colon);
            id = colon < 0 ? value : value.Substring(colon + 1);
        }

        internal static void AssignParts(UnityEngine.Object[] targets, string path, string ns, string id)
        {
            foreach (var target in targets)
            {
                var serialized = new SerializedObject(target);
                var property = serialized.FindProperty(path);
                if (property == null) continue;
                Split(property.stringValue, out var existingNamespace, out var existingId);
                property.stringValue = (ns?.Replace(":", string.Empty) ?? existingNamespace) + ":" +
                    (id?.Replace(":", string.Empty) ?? existingId);
                serialized.ApplyModifiedProperties(); // Undo and prefab overrides use the normal serialized path.
            }
        }
    }
}

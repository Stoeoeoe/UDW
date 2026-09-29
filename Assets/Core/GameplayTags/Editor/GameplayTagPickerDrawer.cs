using System.Collections.Generic;
using System.Linq;
using Sirenix.OdinInspector.Editor;
using UnityEditor;
using UnityEngine;

namespace Core.GameplayTags.Editor
{
    [CustomPropertyDrawer(typeof(GameplayTagPickerAttribute))]
    internal sealed class GameplayTagPickerDrawer : PropertyDrawer
    {
        public override void OnGUI(Rect position, SerializedProperty property, GUIContent label)
        {
            if (property.propertyType != SerializedPropertyType.String)
            {
                EditorGUI.PropertyField(position, property, label);
                return;
            }

            EditorGUI.BeginProperty(position, label, property);
            var fieldRect = EditorGUI.PrefixLabel(position, label);
            var value = property.stringValue;
            var catalog = GameplayTagCatalog.Load();
            var known = string.IsNullOrEmpty(value) || catalog != null && catalog.Contains(value);
            var oldColor = GUI.color;
            if (!known) GUI.color = new Color(1f, 0.6f, 0.6f);
            if (EditorGUI.DropdownButton(fieldRect, new GUIContent(property.hasMultipleDifferentValues ? "—" : string.IsNullOrEmpty(value) ? "None" : value), FocusType.Keyboard))
                ShowSelector(fieldRect, property);
            GUI.color = oldColor;
            EditorGUI.EndProperty();
        }

        private static void ShowSelector(Rect rect, SerializedProperty property)
        {
            var targets = property.serializedObject.targetObjects;
            var path = property.propertyPath;
            var current = property.stringValue;
            var catalog = GameplayTagCatalog.Load();
            var choices = new List<string> { string.Empty };
            if (catalog != null)
                choices.AddRange(catalog.Tags);

            var selector = new GenericSelector<string>("Gameplay Tags", false,
                tag => string.IsNullOrEmpty(tag) ? "None" : tag.Replace('.', '/'), choices);
            selector.SelectionTree.Config.DrawSearchToolbar = true;
            selector.EnableSingleClickToSelect();
            if (choices.Contains(current)) selector.SetSelection(current);
            selector.SelectionConfirmed += selection => Assign(targets, path, selection.FirstOrDefault() ?? string.Empty);

            var popup = selector.ShowInPopup(rect, 320f);
            popup.OnEndGUI += () =>
            {
                if (!GUILayout.Button("Manage Tags...")) return;
                popup.Close();
                GameplayTagCatalogWindow.Open();
            };
        }

        private static void Assign(UnityEngine.Object[] targets, string path, string tag)
        {
            foreach (var target in targets)
            {
                var serialized = new SerializedObject(target);
                var value = serialized.FindProperty(path);
                if (value == null) continue;
                value.stringValue = tag;
                serialized.ApplyModifiedProperties();
            }
        }
    }
}

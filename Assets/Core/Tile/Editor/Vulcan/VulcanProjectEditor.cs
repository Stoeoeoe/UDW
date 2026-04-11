using Core.Tile.Vulcan;
using UnityEditor;
using UnityEditor.UIElements;
using UnityEngine;
using UnityEngine.UIElements;

namespace Core.Tile.Editor.Vulcan
{
    [CustomEditor(typeof(VulcanProject))]
    public class VulcanProjectEditor : UnityEditor.Editor
    {
        public override VisualElement CreateInspectorGUI()
        {
            var root = new VisualElement();
            root.style.paddingLeft = 6;
            root.style.paddingRight = 6;
            root.style.paddingTop = 4;
            root.style.paddingBottom = 4;

            var project = target as VulcanProject;
            if (project != null)
            {
                AddWarnings(root, project);
            }

            InspectorElement.FillDefaultInspector(root, serializedObject, this);
            return root;
        }

        private static void AddWarnings(VisualElement root, VulcanProject project)
        {
            if (project.MappingWarnings == null || project.MappingWarnings.Length == 0)
                return;

            root.Add(new HelpBox("Vulcan auto-mapping warnings", HelpBoxMessageType.Warning));
            for (var i = 0; i < project.MappingWarnings.Length; i++)
            {
                var warning = project.MappingWarnings[i];
                if (string.IsNullOrWhiteSpace(warning))
                    continue;

                var label = new Label($"- {warning}");
                label.style.whiteSpace = WhiteSpace.Normal;
                label.style.unityTextAlign = TextAnchor.UpperLeft;
                root.Add(label);
            }
        }
    }
}

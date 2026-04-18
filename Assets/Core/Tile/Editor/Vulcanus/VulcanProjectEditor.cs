using Core.Tile.Vulcanus;
using UnityEditor;
using UnityEditor.UIElements;
using UnityEngine;
using UnityEngine.UIElements;

namespace Core.Tile.Editor.Vulcanus
{
    [CustomEditor(typeof(VulcanusProject))]
    public class VulcanusProjectEditor : UnityEditor.Editor
    {
        public override VisualElement CreateInspectorGUI()
        {
            var root = new VisualElement();
            root.style.paddingLeft = 6;
            root.style.paddingRight = 6;
            root.style.paddingTop = 4;
            root.style.paddingBottom = 4;

            var project = target as VulcanusProject;
            if (project != null)
            {
                AddWarnings(root, project);
            }

            InspectorElement.FillDefaultInspector(root, serializedObject, this);
            return root;
        }

        private static void AddWarnings(VisualElement root, VulcanusProject project)
        {
            if (project.MappingWarnings == null || project.MappingWarnings.Length == 0)
                return;

            root.Add(new HelpBox("Vulcanus auto-mapping warnings", HelpBoxMessageType.Warning));
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

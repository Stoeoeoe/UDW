using System;
using System.Collections.Generic;
using System.Linq;
using Sirenix.OdinInspector;
using Sirenix.OdinInspector.Editor;
using UnityEditor;
using UnityEngine;

namespace Core.GameplayTags.Editor
{
    internal sealed class GameplayTagCatalogWindow : OdinMenuEditorWindow
    {
        private string _newTag = string.Empty;

        [MenuItem("Tools/Gameplay Tags")]
        internal static void Open()
        {
            var window = GetWindow<GameplayTagCatalogWindow>();
            window.titleContent = new GUIContent("Gameplay Tags");
            window.Show();
        }

        protected override OdinMenuTree BuildMenuTree()
        {
            var tree = new OdinMenuTree
            {
                Selection =
                {
                    SupportsMultiSelect = false
                }
            };

            var catalog = GameplayTagCatalog.Load();
            if (catalog != null)
            {
                var paths = new HashSet<string>(StringComparer.Ordinal);
                foreach (var tag in catalog.Tags)
                {
                    paths.Add(tag);
                    for (var dot = tag.IndexOf('.'); dot >= 0; dot = tag.IndexOf('.', dot + 1))
                        paths.Add(tag.Substring(0, dot));
                }

                foreach (var path in paths.OrderBy(value => value.Count(character => character == '.'))
                             .ThenBy(value => value, StringComparer.Ordinal))
                    tree.Add(path.Replace('.', '/'), new TagEntry(this, path));
            }

            return tree;
        }

        protected override void OnImGUI()
        {
            using (new EditorGUILayout.HorizontalScope(EditorStyles.toolbar))
            {
                GUILayout.Label("Tag path (e.g. Weapon.Sword)", GUILayout.Width(175f));
                var fieldWidth = Mathf.Clamp(position.width - 260f, 120f, 320f);
                _newTag = GUILayout.TextField(_newTag, EditorStyles.toolbarTextField, GUILayout.Width(fieldWidth));
                if (GUILayout.Button("Add Tag", EditorStyles.toolbarButton, GUILayout.Width(70f)))
                    AddTag(_newTag);
            }

            base.OnImGUI();
        }

        private void AddTag(string tag)
        {
            var catalog = GameplayTagCatalog.Load();
            if (catalog == null)
            {
                EditorUtility.DisplayDialog("Gameplay Tags", "The gameplay tag catalog asset is missing.", "OK");
                return;
            }

            try
            {
                if (!catalog.Add(tag))
                    EditorUtility.DisplayDialog("Gameplay Tags", $"'{tag}' already exists.", "OK");
                else
                {
                    _newTag = string.Empty;
                    ForceMenuTreeRebuild();
                }
            }
            catch (ArgumentException error)
            {
                EditorUtility.DisplayDialog("Invalid gameplay tag", error.Message, "OK");
            }
        }

        private sealed class TagEntry
        {
            private readonly GameplayTagCatalogWindow _window;
            private readonly string _tag;

            public TagEntry(GameplayTagCatalogWindow window, string tag)
            {
                _window = window;
                _tag = tag;
            }

            [OnInspectorGUI]
            private void Draw()
            {
                var catalog = GameplayTagCatalog.Load();
                if (catalog == null) return;

                EditorGUILayout.LabelField(_tag, EditorStyles.boldLabel);
                EditorGUILayout.LabelField(catalog.Contains(_tag) ? "Registered tag" : "Group", _tag);

                var branch = catalog.Tags.Where(tag => tag == _tag ||
                    tag.StartsWith(_tag + ".", StringComparison.Ordinal)).ToArray();
                var count = branch.Length;
                var button = count == 1 ? "Delete Tag" : $"Delete Branch ({count} tags)";
                if (GUILayout.Button(button) &&
                    EditorUtility.DisplayDialog("Delete gameplay tags?",
                        $"Delete '{_tag}' and its {count} registered tag{(count == 1 ? "" : "s")}? Existing fields will keep their string values.",
                        "Delete", "Cancel"))
                {
                    catalog.Remove(branch);
                    _window.ForceMenuTreeRebuild();
                }
            }
        }
    }
}

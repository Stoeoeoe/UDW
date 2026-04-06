using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace Tools.Editor
{
    [CustomPropertyDrawer(typeof(ToolEffectConfiguration))]
    public class ToolEffectConfigurationDrawer : PropertyDrawer
    {
        private const int GridSize = 9;
        private const int CellSize = 22;
        private const int Padding = 4;

        private HashSet<Vector2Int> offsets = new();

        public override float GetPropertyHeight(SerializedProperty property, GUIContent label)
        {
            int rows = GridSize + 3; // grid + header + presets
            return rows * (CellSize + 2);
        }

        public override void OnGUI(Rect position, SerializedProperty property, GUIContent label)
        {
            SerializedProperty offsetsProp =
                property.FindPropertyRelative(nameof(ToolEffectConfiguration.AffectedTileOffsets));
            SerializedProperty globalProp =
                property.FindPropertyRelative(nameof(ToolEffectConfiguration.IsGlobalEffect));

            LoadOffsets(offsetsProp);

            EditorGUI.BeginProperty(position, label, property);

            Rect line = position;
            line.height = EditorGUIUtility.singleLineHeight;

            EditorGUI.PropertyField(line, globalProp);
            line.y += line.height + Padding;

            DrawDirectionIndicator(ref line);
            DrawGrid(ref line);

            SaveOffsets(offsetsProp);

            EditorGUI.EndProperty();
        }

        private void DrawDirectionIndicator(ref Rect line)
        {
            Rect r = new(line.x, line.y, GridSize * (CellSize + 2), CellSize);

            var style = EditorStyles.boldLabel;
            style.alignment = TextAnchor.MiddleCenter;
            GUI.Label(r, "Player Direction", style);
            r.y += CellSize;

            Rect arrowRect = new(r.x + (r.width / 2) - 10, r.y, 20, 20);
            GUI.Label(arrowRect, "↑", new GUIStyle(EditorStyles.label)
            {
                fontSize = 18,
                alignment = TextAnchor.MiddleCenter
            });

            line.y += CellSize * 2;
        }

        private void DrawGrid(ref Rect line)
        {
            int half = GridSize / 2;

            for (int y = GridSize - 1; y >= 0; y--)
            {
                Rect row = new(line.x, line.y, GridSize * (CellSize + 2), CellSize);

                for (int x = 0; x < GridSize; x++)
                {
                    Vector2Int offset = new(x - half, y - half);

                    Rect cell = new(
                        row.x + x * (CellSize + 2),
                        row.y,
                        CellSize,
                        CellSize
                    );

                    bool isCenter = offset == Vector2Int.zero;
                    bool selected = offsets.Contains(offset);

                    Color old = GUI.backgroundColor;

                    if (isCenter)
                        GUI.backgroundColor = Color.yellow;
                    else if (selected)
                        GUI.backgroundColor = Color.green;
                    else
                        GUI.backgroundColor = Color.gray;

                    if (GUI.Button(cell, isCenter ? "P" : ""))
                    {
                        if (!isCenter)
                            Toggle(offset);
                    }

                    GUI.backgroundColor = old;
                }

                line.y += CellSize + 2;
            }
        }

        private void Toggle(Vector2Int offset)
        {
            if (!offsets.Add(offset))
                offsets.Remove(offset);
        }

        private void LoadOffsets(SerializedProperty prop)
        {
            offsets.Clear();
            for (int i = 0; i < prop.arraySize; i++)
                offsets.Add(prop.GetArrayElementAtIndex(i).vector2IntValue);
        }

        private void SaveOffsets(SerializedProperty prop)
        {
            prop.arraySize = offsets.Count;

            int i = 0;
            foreach (var offset in offsets.OrderBy(o => o.y).ThenBy(o => o.x))
            {
                prop.GetArrayElementAtIndex(i++).vector2IntValue = offset;
            }
        }
    }
}
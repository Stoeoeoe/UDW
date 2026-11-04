using System.Reflection;
using UnityEngine;
using UnityEngine.InputSystem;
using VContainer;

namespace Core.Context
{
    public class PlayerInteractionContextDebugView : MonoBehaviour
    {
        [Inject] private PlayerInteractionContext _playerInteractionContext;
        [Inject] private CharacterManager _characters;

        private bool _visible;

        private void Update()
        {
            if (Keyboard.current.backquoteKey.wasPressedThisFrame)
            {
                _visible = !_visible;
            }
        }

        private void OnGUI()
        {
            if (!_visible) return;

            var ctx = _playerInteractionContext;

            var snapshot = ctx.CurrentSnapshot;
            if (snapshot == null)
            {
                GUILayout.Label("No snapshot available");
                return;
            }

            DrawSnapshot(snapshot, ctx.CurrentSnapshot.Mode);
        }

        private void DrawSnapshot(object snapshot, InteractionMode mode)
        {
            GUILayout.BeginArea(new Rect(10, 10, 450, Screen.height - 20), GUI.skin.box);

            GUILayout.Label("Player Interaction Context", EditorStyleHeader());
            GUILayout.Space(5);

            GUILayout.Label($"Mode: {mode}");
            GUILayout.Space(10);

            var type = snapshot.GetType();
            var props = type.GetProperties(BindingFlags.Public | BindingFlags.Instance);

            foreach (var prop in props)
            {
                object value;
                try
                {
                    value = prop.GetValue(snapshot);
                }
                catch
                {
                    value = "<error>";
                }

                DrawRow(prop.Name, value);
            }
            
            // Action state
            var executor = _characters.MainCharacter.PerformPrimaryAction.ActionExecutor;
            DrawRow("CurrentAction", executor.CurrentAction?.ActionName);
            DrawRow("ActionState", executor.State);

            GUILayout.EndArea();
        }

        private void DrawRow(string propertyName, object value)
        {
            GUILayout.BeginHorizontal();

            GUILayout.Label(propertyName, GUILayout.Width(200));

            GUILayout.Label(FormatValue(value));

            GUILayout.EndHorizontal();
        }

        private string FormatValue(object value)
        {
            return value switch
            {
                null => "<null>",
                Object unityObj => unityObj ? unityObj.name : "<destroyed>",
                _ => value.ToString()
            };
        }

        private GUIStyle EditorStyleHeader()
        {
            var style = new GUIStyle(GUI.skin.label)
            {
                fontStyle = FontStyle.Bold,
                fontSize = 14
            };
            return style;
        }
    }
}

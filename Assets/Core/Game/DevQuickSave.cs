#if UNITY_EDITOR || DEBUG
using UnityEngine;
using UnityEngine.InputSystem;
using VContainer.Unity;

namespace Core.Game
{
    /// <summary>Development hotkeys: F5 quick saves and F9 quick loads, so testing never needs a restart.</summary>
    public sealed class DevQuickSave : ITickable
    {
        private readonly GameStateManager _game;

        public DevQuickSave(GameStateManager game) => _game = game;

        public void Tick()
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;
            if (keyboard.f5Key.wasPressedThisFrame) QuickSave();
            if (keyboard.f9Key.wasPressedThisFrame) QuickLoad();
        }

        private void QuickSave()
        {
            if (!_game.CanSaveOrLoadNow) Debug.LogWarning("Quick save is not possible right now (cutscene, dialogue, open screen or transition).");
            else if (_game.QuickSave()) Debug.Log("Quick saved.");
        }

        private void QuickLoad()
        {
            if (!_game.CanSaveOrLoadNow) Debug.LogWarning("Quick load is not possible right now (cutscene, dialogue, open screen or transition).");
            else if (!_game.QuickLoad()) Debug.LogWarning("There is no quick save to load.");
        }
    }
}
#endif

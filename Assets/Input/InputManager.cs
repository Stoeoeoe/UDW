using System;
using UnityEngine.InputSystem;
using Core;
using Core.Location;
using UnityEngine;

namespace Input
{
    /// <summary>
    /// Single-player input manager.
    /// Exposes raw InputActions — abilities query them directly each frame.
    /// </summary>
    [RequireComponent(typeof(PlayerInput))]
    [DefaultExecutionOrder(100)]
    public class InputManager : Singleton<InputManager>, ILocationLifecycle
    {
        private PlayerInput _player;
        private InputActionAsset _actions;
        private InputActionMap _playerControls, _ui, _global, _screenMap;
        private bool _inputEnabled = true;
        public InputActionAsset Actions => _actions;
        public InputActionMap PlayerControls => _playerControls;
        public string ActiveMapName => (_screenMap ?? _playerControls).name;

        // ── Convenience shortcuts (most-used actions) ────────────────────────────────

        public Vector2 Move => _playerControls["PrimaryMovement"].ReadValue<Vector2>();
        public bool RunHeld => _playerControls["Run"].IsPressed();
        public bool DashPressed => _playerControls["Dash"].WasPerformedThisFrame();
        public bool InteractPressed => _playerControls["Interact"].WasPerformedThisFrame();
        public bool PausePressed => _global["Pause"].WasPerformedThisFrame();
        public bool OpenInventoryPressed => _global["OpenInventory"].WasPerformedThisFrame();
        public bool NextSlotPressed => _playerControls["NextSlot"].WasPerformedThisFrame();
        public bool PreviousSlotPressed => _playerControls["PreviousSlot"].WasPerformedThisFrame();
        public float ChangeSlotAxis => _playerControls["ChangeSlotAxis"].ReadValue<float>();

        public bool PerformPrimaryActionDown => _playerControls["PerformPrimaryAction"].WasPressedThisFrame();
        public bool PerformPrimaryActionHeld => _playerControls["PerformPrimaryAction"].IsPressed();
        public bool PerformPrimaryActionReleased => _playerControls["PerformPrimaryAction"].WasReleasedThisFrame();

        public bool PerformSecondaryActionDown =>
            _playerControls["PerformSecondaryAction"].WasPerformedThisFrame();

        public bool PerformSecondaryActionHeld => _playerControls["PerformSecondaryAction"].IsPressed();

        public bool PerformSecondaryActionReleased =>
            _playerControls["PerformSecondaryAction"].WasReleasedThisFrame();

        protected override void OnAwake()
        {
            _player = GetComponent<PlayerInput>();
            _actions = _player.actions ?? throw new InvalidOperationException("InputManager requires PlayerInput actions.");
            _playerControls = _actions.FindActionMap("PlayerControls", true);
            _ui = _actions.FindActionMap("UI", true);
            _global = _actions.FindActionMap("Global", true);
            _global.FindAction("OpenInventory", true);
            _global.FindAction("Pause", true);
            ApplyMaps();
        }

        public void ValidateScreenMap(string name)
        {
            var map = _actions.FindActionMap(name, true);
            if (map == _playerControls || map == _global)
                throw new ArgumentException("A modal screen cannot use gameplay or global input.", nameof(name));
        }

        public void SetScreenMap(string name)
        {
            if (name != null) ValidateScreenMap(name);
            var map = name == null ? null : _actions.FindActionMap(name, true);
            if (map == _screenMap) return;
            _screenMap = map;
            ApplyMaps();
        }

        private void ApplyMaps()
        {
            _actions.Disable();
            _player.currentActionMap = _inputEnabled ? _screenMap ?? _playerControls : null;
            if (!_inputEnabled) return;
            _global.Enable();
            // Standard UI navigation also serves the HUD and screens with extra actions.
            _ui.Enable();
        }

        public void DisableInput() { _inputEnabled = false; ApplyMaps(); }
        public void EnableInput() { _inputEnabled = true; ApplyMaps(); }
        public void OnLocationEnter(LocationData location) => EnableInput();
        public void OnLocationLeave(LocationData location) => DisableInput();
    }
}

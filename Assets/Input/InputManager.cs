using System;
using System.Collections.Generic;
using UnityEngine.InputSystem;
using Core;
using Core.Location;
using Core.Events;
using Core.TimeAndWeather;
using UnityEngine;

namespace Input
{
    /// <summary>
    /// Single-player input manager.
    /// Exposes raw InputActions — abilities query them directly each frame.
    /// </summary>
    [RequireComponent(typeof(PlayerInput))]
    [DefaultExecutionOrder(100)]
    public class InputManager : Singleton<InputManager>, ILocationLifecycle,
        IEventListener<DayTransitionStarted>, IEventListener<DayTransitionFinished>
    {
        private PlayerInput _player;
        private InputActionAsset _actions;
        // Script reload serializes private action maps inline, even turning a null screen map
        // into an empty map. These references belong to PlayerInput's live asset only.
        [NonSerialized] private InputActionMap _playerControls, _ui, _global, _screenMap;
        private readonly HashSet<InputBlockContext> _blocks = new();
        [NonSerialized] private bool _cutsceneActive;

        private enum InputBlockContext { Location, DayTransition }
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
        public bool SkipCutscenePressed => _ui["Cancel"].WasPerformedThisFrame();
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

        private void BindActions()
        {
            _player = GetComponent<PlayerInput>();
            _actions = _player.actions ?? throw new InvalidOperationException("InputManager requires PlayerInput actions.");
            _playerControls = _actions.FindActionMap("PlayerControls", true);
            _ui = _actions.FindActionMap("UI", true);
            _global = _actions.FindActionMap("Global", true);
            _global.FindAction("OpenInventory", true);
            _global.FindAction("Pause", true);
            _ui.FindAction("Cancel", true);
        }

        public void ValidateScreenMap(string name)
        {
            var map = _actions.FindActionMap(name, true);
            if (map == _playerControls || map == _global)
                throw new ArgumentException("A modal screen cannot use gameplay or global input.", nameof(name));
        }

        private void OnEnable()
        {
            BindActions();
            this.Subscribe<DayTransitionStarted>();
            this.Subscribe<DayTransitionFinished>();
            ApplyMaps();
        }

        private void OnDisable()
        {
            this.Unsubscribe<DayTransitionStarted>();
            this.Unsubscribe<DayTransitionFinished>();
            SetContextBlocked(InputBlockContext.DayTransition, false);
            _actions.Disable();
        }

        /// <summary>Blocks all action maps for the overnight interval without changing the location's gate.</summary>
        public void OnEvent(DayTransitionStarted change) => SetContextBlocked(InputBlockContext.DayTransition, true);

        /// <summary>Releases only the overnight input block.</summary>
        public void OnEvent(DayTransitionFinished change) => SetContextBlocked(InputBlockContext.DayTransition, false);

        // Each lifecycle context is active or inactive, even if its notification repeats.
        private void SetContextBlocked(InputBlockContext context, bool blocked)
        {
            if (blocked) _blocks.Add(context);
            else _blocks.Remove(context);
            if (isActiveAndEnabled) ApplyMaps();
        }

        public void SetScreenMap(string name)
        {
            if (name != null) ValidateScreenMap(name);
            var map = name == null ? null : _actions.FindActionMap(name, true);
            if (map == _screenMap) return;
            _screenMap = map;
            ApplyMaps();
        }

        // Cutscenes suppress gameplay and global shortcuts, but retain dialogue and skip input.
        internal void SetCutsceneActive(bool active)
        {
            _cutsceneActive = active;
            ApplyMaps();
        }

        private void ApplyMaps()
        {
            _actions.Disable();
            _player.currentActionMap = _blocks.Count == 0 ? _screenMap ?? (_cutsceneActive ? _ui : _playerControls) : null;
            if (_blocks.Count > 0) return;
            if (!_cutsceneActive) _global.Enable();
            // Standard UI navigation also serves the HUD and screens with extra actions.
            _ui.Enable();
        }

        public void OnLocationEnter(LocationData location) => SetContextBlocked(InputBlockContext.Location, false);

        public void OnLocationLeave(LocationData location) => SetContextBlocked(InputBlockContext.Location, true);
    }
}

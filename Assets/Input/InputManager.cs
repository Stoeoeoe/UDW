using Core;
using UnityEngine;

namespace Input
{
    /// <summary>
    /// Single-player input manager.
    /// Exposes raw InputActions — abilities query them directly each frame.
    /// </summary>
    public class InputManager : PersistentSingleton<InputManager>
    {
        InputSystem_Actions _actions;

        public InputSystem_Actions.PlayerControlsActions PlayerControls => _actions.PlayerControls;

        // ── Convenience shortcuts (most-used actions) ────────────────────────────────

        public Vector2 Move                  => _actions.PlayerControls.PrimaryMovement.ReadValue<Vector2>();
        public bool    RunHeld               => _actions.PlayerControls.Run.IsPressed();
        public bool    DashPressed           => _actions.PlayerControls.Dash.WasPerformedThisFrame();
        public bool    InteractPressed       => _actions.PlayerControls.Interact.WasPerformedThisFrame();
        public bool    PausePressed          => _actions.PlayerControls.Pause.WasPerformedThisFrame();
        public bool    OpenInventoryPressed  => _actions.PlayerControls.OpenInventory.WasPerformedThisFrame();
        public bool    NextSlotPressed       => _actions.PlayerControls.NextSlot.WasPerformedThisFrame();
        public bool    PreviousSlotPressed   => _actions.PlayerControls.PreviousSlot.WasPerformedThisFrame();
        public float   ChangeSlotAxis        => _actions.PlayerControls.ChangeSlotAxis.ReadValue<float>();

        public bool PerformPrimaryActionDown     => _actions.PlayerControls.PerformPrimaryAction.WasPerformedThisFrame();
        public bool PerformPrimaryActionHeld     => _actions.PlayerControls.PerformPrimaryAction.IsPressed();
        public bool PerformPrimaryActionReleased => _actions.PlayerControls.PerformPrimaryAction.WasReleasedThisFrame();

        public bool PerformSecondaryActionDown     => _actions.PlayerControls.PerformSecondaryAction.WasPerformedThisFrame();
        public bool PerformSecondaryActionHeld     => _actions.PlayerControls.PerformSecondaryAction.IsPressed();
        public bool PerformSecondaryActionReleased => _actions.PlayerControls.PerformSecondaryAction.WasReleasedThisFrame();

        protected override void OnAwake()
        {
            _actions = new InputSystem_Actions();
            _actions.Enable();
        }

        void OnDestroy() => _actions?.Dispose();
    }
}

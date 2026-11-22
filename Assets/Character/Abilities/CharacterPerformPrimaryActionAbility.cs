using System;
using Core.Context;
using Core.Location;
using Input;
using Interaction;
using Interaction.Tools;
using UnityEngine;
using UnityEngine.EventSystems;
using VContainer;

namespace Character.Abilities
{
    public class CharacterPerformPrimaryActionAbility : CharacterAbility
    {
        [Inject] private InputManager _inputManager;

        public ActionExecutor ActionExecutor { get; internal set; }
        [Inject] private PlayerInteractionContext _context;
        private bool _suppressPrimaryUntilRelease;
        // How the running attempt sees each moment: only the target its button chose, or none for a tool.
        private Func<PlayerInteractionContextSnapshot, PlayerInteractionContextSnapshot> _attemptView = snapshot => snapshot;

        protected override void Awake()
        {
            base.Awake();
            ActionExecutor = new ActionExecutor(
                Character,
                () => _attemptView(_context.CurrentSnapshot)
            );
            _context.OnContextChanged += HandleContextChanged;
        }

        private void OnDestroy()
        {
            _context.OnContextChanged -= HandleContextChanged;
        }

        private void OnDisable() => ActionExecutor?.InterruptCurrentAction();

        private void HandleContextChanged(PlayerInteractionContextSnapshot snapshot)
        {
            if (!snapshot.CanInteractWithWorld) _suppressPrimaryUntilRelease = true;
            if (!snapshot.CanInteractWithWorld && ActionExecutor.State == ActionExecutionState.Preparing)
                InterruptAction();
        }

        public override void Tick()
        {
            var snapshot = _context.CurrentSnapshot;
            var input = _inputManager;
            if (!snapshot.CanInteractWithWorld)
            {
                if (ActionExecutor.State == ActionExecutionState.Preparing) InterruptAction();
                return;
            }
            if (_suppressPrimaryUntilRelease)
            {
                if (input.PerformPrimaryActionHeld) return;
                _suppressPrimaryUntilRelease = false;
            }
            var pointerOverUI = EventSystem.current && EventSystem.current.IsPointerOverGameObject();

            // Always allow release to continue from prepare so the executor doesn't get stuck
            // if the player moves the cursor over UI while holding the button.
            if (input.PerformPrimaryActionReleased && ActionExecutor.State == ActionExecutionState.Preparing)
            {
                ActionExecutor.ContinueFromPrepare();
            }

            // If ability isn't authorized (e.g. character frozen), we still want to allow
            // the release input to be processed so ContinueFromPrepare can be called while
            // the ActionExecutor is in Preparing. Otherwise the executor can get stuck.
            if (!AbilityAuthorized && ActionExecutor.State != ActionExecutionState.Preparing) return;

            // Only block starting a new action when the pointer is over UI.
            if (!ActionExecutor.IsIdle || pointerOverUI) return;
            var view = ChooseAttempt(snapshot, input.InteractDown, input.InteractFromMouse, input.PerformPrimaryActionDown);
            if (view == null) return;
            var action = Character.ActionRegistry.GetActionForMode(view(snapshot).Mode);
            if (action) RunAction(action, view);
        }

        /// <summary>
        /// How a button press sees the moment for its attempt, or null when the press does nothing. Right click uses the
        /// hovered target; Interact keys and the gamepad use the one in front. The action button uses the held tool or
        /// seed but never on what is outlined: aiming at the pointer stops on a hovered target, facing aim on one in front.
        /// </summary>
        internal static Func<PlayerInteractionContextSnapshot, PlayerInteractionContextSnapshot> ChooseAttempt(
            PlayerInteractionContextSnapshot snapshot, bool interactDown, bool interactFromMouse, bool actionDown)
        {
            if (interactDown)
            {
                if (interactFromMouse)
                    return snapshot.HoveredTarget ? moment => moment.WithTargets(moment.InteractableUnderPointer, null) : null;
                return snapshot.FrontTarget ? moment => moment.WithTargets(null, moment.CurrentInteractable) : null;
            }
            if (!actionDown) return null;
            var facing = snapshot.CurrentTool && snapshot.CurrentTool.Targeting == ToolTargeting.Facing;
            if (facing ? snapshot.FrontTarget : snapshot.HoveredTarget) return null;
            return moment => moment.WithTargets(null, null);
        }

        public override void OnLocationLeave(LocationData location)
        {
            base.OnLocationLeave(location);
            InterruptAction();
        }

        // Input callback boundary: observe failures after the executor has released its resources.
        private async void RunAction(AbstractAction action,
            Func<PlayerInteractionContextSnapshot, PlayerInteractionContextSnapshot> view)
        {
            _attemptView = view;
            try { await ActionExecutor.RunAsync(action, !action.HasPreparationPhase); }
            catch (Exception error) { Debug.LogException(error, this); }
            finally { _attemptView = snapshot => snapshot; }
        }

        /// <summary>Cancels the attempt and synchronously releases its action and control ownership.</summary>
        public void InterruptAction() => ActionExecutor.InterruptCurrentAction();
    }
}

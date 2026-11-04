using System;
using Core.Context;
using Core.Location;
using Input;
using Interaction;
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

        protected override void Awake()
        {
            base.Awake();
            ActionExecutor = new ActionExecutor(
                Character,
                () => _context.CurrentSnapshot
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
            if (input.PerformPrimaryActionDown && ActionExecutor.IsIdle && !pointerOverUI)
            {
                var action = Character.ActionRegistry.GetActionForMode(snapshot.Mode);
                if (action) RunAction(action);
            }
        }

        public override void OnLocationLeave(LocationData location)
        {
            base.OnLocationLeave(location);
            InterruptAction();
        }

        // Input callback boundary: observe failures after the executor has released its resources.
        private async void RunAction(AbstractAction action)
        {
            try { await ActionExecutor.RunAsync(action, !action.HasPreparationPhase); }
            catch (Exception error) { Debug.LogException(error, this); }
        }

        /// <summary>Cancels the attempt and synchronously releases its action and control ownership.</summary>
        public void InterruptAction() => ActionExecutor.InterruptCurrentAction();
    }
}

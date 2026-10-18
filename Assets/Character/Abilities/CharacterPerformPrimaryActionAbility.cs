using Core.Context;
using Core.Events;
using Core.Location;
using Input;
using Interaction;
using UnityEngine.EventSystems;
using UnityEngine;

namespace Character.Abilities
{
    public class CharacterPerformPrimaryActionAbility : CharacterAbility
    {
        public ActionExecutor ActionExecutor { get; private set; }
        private Coroutine _runningAction;
        private PlayerInteractionContext _context;
        private bool _suppressPrimaryUntilRelease;

        protected override void Awake()
        {
            base.Awake();
            ActionExecutor = new ActionExecutor(
                Character,
                () => PlayerInteractionContext.Instance.CurrentSnapshot
            );
            BindContext();
        }

        private void BindContext()
        {
            var context = PlayerInteractionContext.Instance;
            if (_context == context) return;
            if (_context) _context.OnContextChanged -= HandleContextChanged;
            _context = context;
            if (_context) _context.OnContextChanged += HandleContextChanged;
        }

        private void OnDestroy()
        {
            if (_context) _context.OnContextChanged -= HandleContextChanged;
        }

        private void HandleContextChanged(PlayerInteractionContextSnapshot snapshot)
        {
            if (!snapshot.CanInteractWithWorld) _suppressPrimaryUntilRelease = true;
            // Stop the coroutine too: resetting the executor alone releases its preparation wait.
            if (!snapshot.CanInteractWithWorld && ActionExecutor.State == ActionExecutionState.Preparing)
                InterruptAction();
        }

        public override void Tick()
        {
            BindContext();
            if (!_context) return;
            var snapshot = _context.CurrentSnapshot;
            var input = InputManager.Instance;
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
                if (action) _runningAction = StartCoroutine(ActionExecutor.Run(action, !action.HasPreparationPhase));
            }
        }

        public override void OnLocationLeave(LocationData location)
        {
            base.OnLocationLeave(location);
            InterruptAction();
        }

        /// <summary>Stops the running action and releases its preparation, feedback and control ownership.</summary>
        public void InterruptAction()
        {
            if (_runningAction != null) StopCoroutine(_runningAction);
            _runningAction = null;
            ActionExecutor.InterruptCurrentAction();
        }
    }
}

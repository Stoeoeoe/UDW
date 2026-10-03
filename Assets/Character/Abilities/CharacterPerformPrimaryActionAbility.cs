using Core.Context;
using Core.Events;
using Core.Location;
using Input;
using Interaction;
using UnityEngine.EventSystems;

namespace Character.Abilities
{
    public class CharacterPerformPrimaryActionAbility : CharacterAbility
    {
        public ActionExecutor ActionExecutor { get; private set; }

        protected override void Awake()
        {
            base.Awake();
            ActionExecutor = new ActionExecutor(
                Character,
                () => PlayerInteractionContext.Instance.CurrentSnapshot
            );
        }

        public override void Tick()
        {
            var snapshot = PlayerInteractionContext.Instance.CurrentSnapshot;
            var input = InputManager.Instance;
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
            if (snapshot.SceneReady && input.PerformPrimaryActionDown && ActionExecutor.IsIdle && !pointerOverUI)
            {
                var action = Character.ActionRegistry.GetActionForMode(snapshot.Mode);
                if (action) StartCoroutine(ActionExecutor.Run(action, !action.HasPreparationPhase));
            }
        }

        public override void OnLocationLeave(LocationData location)
        {
            base.OnLocationLeave(location);
            ActionExecutor.InterruptCurrentAction();
        }
    }
}

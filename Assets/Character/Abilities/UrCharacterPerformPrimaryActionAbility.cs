using Core.Context;
using Interaction;
using MoreMountains.Tools;
using UnityEngine.EventSystems;

namespace Character.Abilities
{
    public class UrCharacterPerformPrimaryActionAbility : UrCharacterAbility
    {
        public ActionExecutor ActionExecutor { get; private set; }

        protected override void Initialization()
        {
            base.Initialization();
            ActionExecutor = new ActionExecutor(
                CurrentCharacter, 
                () => PlayerInteractionContext.Current.CurrentSnapshot
            );
        }

        protected override void HandleInput()
        {
            base.HandleInput();

            if (!AbilityAuthorized) return;

            // Prevent actions when interacting with UI
            if(EventSystem.current.IsPointerOverGameObject()) return;
            
            var snapshot = PlayerInteractionContext.Current.CurrentSnapshot;
            var buttonState = UrInputManager.PerformPrimaryActionButton.State.CurrentState;

            switch (buttonState)
            {
                case MMInput.ButtonStates.ButtonDown when ActionExecutor.IsIdle:
                    var action = CurrentCharacter.ActionRegistry.GetActionForMode(snapshot.Mode);
                    if (action) StartCoroutine(ActionExecutor.Run(action, !action.HasPreparationPhase));
                    break;

                case MMInput.ButtonStates.ButtonUp when ActionExecutor.State == ActionExecutionState.Preparing:
                    ActionExecutor.ContinueFromPrepare();
                    break;
            }
        }
    }
}
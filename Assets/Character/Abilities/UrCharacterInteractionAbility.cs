using Interaction;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;
using UnityEngine.Serialization;

namespace Character.Abilities
{
    public class UrCharacterInteractionAbility : UrCharacterAbility
    {
        // [SerializeField] protected InteractionSphere interactionSphere;
        //
        // protected override void Awake()
        // {
        //     base.Awake();
        //     if (interactionSphere == null)
        //     {
        //         throw new MissingComponentException($"InteractionSphere component is missing on {this.name}");
        //     }
        // }
        //
        // protected override void Initialization()
        // {
        //     base.Initialization();
        //     interactionSphere.Initialize(_controller2D as UrTopDownController2D);
        // }
        //
        // protected override void HandleInput()
        // {
        //     base.HandleInput();
        //     if (!AbilityAuthorized || _condition.CurrentState != CharacterStates.CharacterConditions.Normal)
        //     {
        //         return;
        //     }
        //
        //     if ((UrInputManager.InteractButton.State.CurrentState == MMInput.ButtonStates.ButtonUp))
        //     {
        //         var currentInteractable = interactionSphere.CurrentInteractable;
        //         if (currentInteractable &&
        //             UrInputManager.UseToolButton.State.CurrentState == MMInput.ButtonStates.ButtonUp)
        //         {
        //             Interact(currentInteractable);
        //         }
        //     }
        // }
        //
        // public void Interact(BaseInteractable currentInteractable)
        // {
        //     interactionSphere.CurrentInteractable.Interact(this.CurrentCharacter);
        // }
        //
        //
        // public override void ProcessAbility()
        // {
        //     base.ProcessAbility();
        //     if (!AbilityAuthorized || _condition.CurrentState != CharacterStates.CharacterConditions.Normal)
        //     {
        //         return;
        //     }
        // }
    }
}
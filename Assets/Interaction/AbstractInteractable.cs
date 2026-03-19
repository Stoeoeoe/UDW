using Animancer;
using Character;
using MoreMountains.TopDownEngine;
using UnityEngine;

namespace Interaction
{
    // [RequireComponent(typeof(Collider2D))]
    // public abstract class BaseInteractable : MonoBehaviour
    // {
    //     public abstract void Interact(UrCharacter instigator);
    // }

    [RequireComponent(typeof(Collider2D))]
    public abstract class AbstractInteractable : MonoBehaviour
    {
        protected InteractableButtonActivated buttonActivated;
        
        // TODO: Maybe the whole button activation logic can be removed?

        
        protected virtual void Awake()
        {
            // Not inheriting from ButtonActivated to have full control over the editors
            buttonActivated = gameObject.AddComponent<InteractableButtonActivated>();
            buttonActivated.RequiresButtonActivationAbility = false;
            buttonActivated.ButtonActivatedRequirement = ButtonActivated.ButtonActivatedRequirements.Character;
            buttonActivated.DelayBetweenUses = 1f;

            buttonActivated.OnActivation = new UnityEvent();
            buttonActivated.OnActivation.AddListener(() => Interact(buttonActivated.Instigator));;

            
            buttonActivated.Initialize(this);
            
            gameObject.layer = LayerMask.NameToLayer("Interactable");
        }

        public void TriggerInteraction()
        {
            buttonActivated.TriggerButtonAction();
        }

        protected abstract void Interact(UrCharacter instigator);
    }
}
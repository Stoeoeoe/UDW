using System.Collections;
using Core.Context;

namespace Interaction
{
    /// <summary>
    /// Generic action for InteractionMode.Interact.
    /// Calls TriggerInteraction on the nearest valid interactable.
    /// Pointer takes precedence over proximity (consistent with StartDialogueAction).
    /// </summary>
    public class InteractAction : PrimaryAction
    {
        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot) =>
            snapshot.SceneReady && snapshot.ActionableInteractable != null;

        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            var interactable = snapshot.ActionableInteractable;
            interactable?.TriggerInteraction(Owner);
            yield break;
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            
        }
    }
}

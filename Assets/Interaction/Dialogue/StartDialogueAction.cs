using System.Collections;
using Core.Context;

namespace Interaction.Dialogue
{
    public class StartDialogueAction : PrimaryAction
    {
        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            var interactable =
                snapshot.InteractableUnderPointer ?? snapshot.CurrentInteractable;

            interactable.TriggerInteraction(this.Owner);
            yield break;
        }
    }
}
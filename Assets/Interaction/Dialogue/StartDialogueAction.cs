using System.Collections;
using Core.Context;

namespace Interaction.Dialogue
{
    public class StartDialogueAction : PrimaryAction
    {
        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            var interactable =
                snapshot.InteractableUnderPointer ?? snapshot.InteractableInFront;

            interactable.TriggerInteraction();
            yield break;
        }
    }
}
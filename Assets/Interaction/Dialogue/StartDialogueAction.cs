using System.Collections;
using Core.Context;

namespace Interaction.Dialogue
{
    public class StartDialogueAction : PrimaryAction
    {
        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot) =>
            snapshot.SceneReady && snapshot.ActionableInteractable is ShowVulcanusDialogueInteractable;

        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            snapshot.ActionableInteractable?.TriggerInteraction(this.Owner);
            yield break;
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            
        }
    }
}

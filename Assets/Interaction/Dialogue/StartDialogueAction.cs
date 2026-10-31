using UnityEngine;
using System.Threading;
using Core.Context;

namespace Interaction.Dialogue
{
    public class StartDialogueAction : PrimaryAction
    {
        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot) =>
            snapshot.SceneReady && snapshot.ActionableInteractable is ShowVulcanusDialogueInteractable;

        public override Awaitable OnExecute(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            snapshot.ActionableInteractable?.TriggerInteraction(this.Owner);
            return Completed();
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            
        }
    }
}

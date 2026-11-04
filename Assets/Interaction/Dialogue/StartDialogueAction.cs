using System.Threading;
using Core.Context;
using UnityEngine;

namespace Interaction.Dialogue
{
    public class StartDialogueAction : PrimaryAction
    {
        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot) =>
            snapshot.SceneReady && snapshot.ActionableInteractable is ShowVulcanusDialogueInteractable;

        public override Awaitable OnExecute(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            snapshot.ActionableInteractable?.TriggerInteraction(Owner);
            return Completed();
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            
        }
    }
}

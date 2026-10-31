using UnityEngine;
using System.Threading;
using Core.Context;
using Core.Dialogue.Vulcanus;

namespace Interaction.Dialogue
{
    public class ContinueDialogueAction : PrimaryAction
    {

        public override Awaitable OnExecute(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            VulcanusDialogueRunner.Instance.TryAdvanceActiveDialogue();
            return Completed();
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            DialogueCancelledEvent.Trigger();
        }
    }
}

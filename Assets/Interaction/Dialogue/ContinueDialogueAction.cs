using UnityEngine;
using System.Threading;
using Core.Context;
using Core.Dialogue.Vulcanus;
using VContainer;

namespace Interaction.Dialogue
{
    public class ContinueDialogueAction : PrimaryAction
    {
        [Inject] private VulcanusDialogueRunner _dialogue;

        public override Awaitable OnExecute(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            _dialogue.TryAdvanceActiveDialogue();
            return Completed();
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            DialogueCancelledEvent.Trigger();
        }
    }
}

using System.Collections;
using Core.Context;
using Core.Dialogue.Vulcanus;

namespace Interaction.Dialogue
{
    public class ContinueDialogueAction : PrimaryAction
    {

        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            VulcanusDialogueRunner.Instance.TryAdvanceActiveDialogue();
            yield break;
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            DialogueCancelledEvent.Trigger();
        }
    }
}
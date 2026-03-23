using System.Collections;
using Core.Context;

namespace Interaction.Dialogue
{
    public class ContinueDialogueAction : PrimaryAction
    {

        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            UrDialogueManager.Instance.ContinueOrFastForwardDialogue();
            yield break;
        }

    }
}
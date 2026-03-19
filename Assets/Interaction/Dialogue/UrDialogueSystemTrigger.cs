using Character;
using Interaction.Dialog;
using PixelCrushers.DialogueSystem;
using UnityEngine;

public class UrDialogueSystemTrigger : DialogueSystemTrigger
{

    public DialogueOptions Options;

    public override void Fire(Transform actor)
    {
        // If it was set, that's fine
        if(!conversationConversant)
        {
            // Search self or in children and in parent
            conversationConversant = GetComponentInChildren<UrCharacter>(true)?.transform;
            if (!conversationConversant)
            {
                conversationConversant = GetComponentInParent<UrCharacter>()?.transform;
            }
            else
            {
                // Still nothing? Just take  this transform
                conversationConversant = this.transform;
            }
        }

        if(conversationActor == null)
        {
            conversationActor = MainCharacter.CurrentMainCharacter.transform;
        }

        base.Fire(actor);
    }
}

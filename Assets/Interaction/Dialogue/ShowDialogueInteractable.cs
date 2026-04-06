using Character;
using Interaction.Dialog;
using PixelCrushers.DialogueSystem;
using UnityEngine;

namespace Interaction.Dialogue
{
    public class ShowDialogueInteractable : BasicInteractable
    {
        [ActorPopup(true)] [SerializeField] protected string actor;
        [SerializeField] DialogueOptions options;

        [SerializeField] [ConversationPopup(true)]
        protected string conversation;

        protected override void Interact(GameCharacter instigator)
        {
            if (!DialogueManager.IsConversationActive)
            {
                if (conversation == null)
                {
                    Debug.LogWarning($"No conversation assigned to ShowTextInteractable on {this.gameObject.name}");
                    return;
                }

                if (!options.CanMoveWhileTalking)
                    instigator.Freeze();

                DialogueManager.Instance.StartConversation(conversation, this.transform, instigator.transform);
            }
        }
    }
}
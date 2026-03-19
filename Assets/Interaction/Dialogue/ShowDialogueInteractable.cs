using Character;
using Interaction.Dialog;
using MoreMountains.TopDownEngine;
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

        protected override void Awake()
        {
            base.Awake();
            buttonActivated.DelayBetweenUses = 2f;
        }

        protected override void Interact(UrCharacter instigator)
        {
            if (!DialogueManager.IsConversationActive)
            {
                if (conversation == null)
                {
                    Debug.LogWarning($"No conversation assigned to ShowTextInteractable on {this.gameObject.name}");
                    return;
                }

                if (!options.CanMoveWhileTalking)
                {
                    instigator.Freeze();
                    instigator.MovementState.ChangeState(CharacterStates.MovementStates.Idle);
                }

                DialogueManager.Instance.StartConversation(conversation, this.transform, instigator.transform);

                // UrDialogueLifecycleEvent.Trigger(transform,
                //     UrDialogueLifecycleEvent.UrDialogueLifecycleEventType.Started, options);
            }
        }
    }
}
using Character;
using Core.Dialogue.Vulcanus;
using Core.Quests;
using Interaction.Dialog;
using UI.Shared;
using UnityEngine;
using VContainer;

namespace Interaction.Dialogue
{
    public class ShowVulcanusDialogueInteractable : AbstractInteractable
    {
        [SerializeField] private string dialogueId;
        [SerializeField] private DialogueOptions options = new();
        [Inject] private VulcanusDialogueRunner _dialogue;
        [Inject] private QuestService _quests;
        private VulcanusDialogueExecutionContext _conversation;
        private GameCharacter _character;
        private GameCharacter Character => _character ??= GetComponentInParent<GameCharacter>();

        public string DialogueId => dialogueId;
        public DialogueOptions Options => options;

        /// <summary>Set while the character has no time to talk, such as a routine character running too late.</summary>
        public bool Busy { get; set; }

        /// <summary>Without a dialogue there is nothing to say, so the character cannot be talked to; nor while busy.</summary>
        public override bool CanInteract => !Busy && !string.IsNullOrWhiteSpace(DialogueToPlay(out _)) && base.CanInteract;

        /// <summary>
        /// What talking now plays: the dialogue of a quest objective for this character first, otherwise the one its
        /// routine set. The routine's choice is never overwritten, so the character returns to it afterwards.
        /// </summary>
        private string DialogueToPlay(out QuestConversation quest)
        {
            quest = Character ? _quests.FindConversation(Character.CharacterId) : null;
            return string.IsNullOrEmpty(quest?.DialogueId) ? dialogueId : quest.DialogueId;
        }

        /// <summary>
        /// Changes what the character says next, for characters whose routine decides it through the day. A conversation
        /// already running finishes as it started.
        /// </summary>
        public void UseDialogue(string id) => dialogueId = id ?? "";

        /// <summary>Whether a conversation started by talking to this character is still running.</summary>
        public bool IsTalking => _conversation != null && _dialogue.ActiveContext == _conversation;

        protected override bool Interact(GameCharacter instigator)
        {
            var runner = _dialogue;
            if (runner.IsDialogueActive)
                return false;

            // The runner stops game time for every dialogue.
            var pause = options.CanMoveWhileTalking ? ScreenPauseMode.None : ScreenPauseMode.Character;
            var id = DialogueToPlay(out var quest);
            // A quest objective is met only by a conversation that reaches its end.
            if (!runner.StartDialogue(id, instigator, pause, quest == null ? null : () => _quests.CompleteConversation(quest)))
                return false;
            _conversation = runner.ActiveContext;

            return true;
        }
    }
}

using Character;
using Core.Dialogue.Vulcanus;
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
        private VulcanusDialogueExecutionContext _conversation;

        public string DialogueId => dialogueId;
        public DialogueOptions Options => options;

        /// <summary>Set while the character has no time to talk, such as a routine character running too late.</summary>
        public bool Busy { get; set; }

        /// <summary>Without a dialogue there is nothing to say, so the character cannot be talked to; nor while busy.</summary>
        public override bool CanInteract => !Busy && !string.IsNullOrWhiteSpace(dialogueId) && base.CanInteract;

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
            if (!runner.StartDialogue(dialogueId, instigator, pause)) return false;
            _conversation = runner.ActiveContext;

            return true;
        }
    }
}

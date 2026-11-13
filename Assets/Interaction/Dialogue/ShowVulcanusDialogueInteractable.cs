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

        public string DialogueId => dialogueId;
        public DialogueOptions Options => options;

        /// <summary>Without a dialogue there is nothing to say, so the character cannot be talked to.</summary>
        public override bool CanInteract => !string.IsNullOrWhiteSpace(dialogueId) && base.CanInteract;

        /// <summary>
        /// Changes what the character says next, for characters whose routine decides it through the day. A conversation
        /// already running finishes as it started.
        /// </summary>
        public void UseDialogue(string id) => dialogueId = id ?? "";

        protected override bool Interact(GameCharacter instigator)
        {
            var runner = _dialogue;
            if (runner.IsDialogueActive)
                return false;

            var pause = ScreenPauseMode.None;
            if (!options.CanMoveWhileTalking) pause |= ScreenPauseMode.Character;
            if (options.PauseGameClockWhileTalking) pause |= ScreenPauseMode.GameClock;
            if (!runner.StartDialogue(dialogueId, instigator, pause)) return false;

            return true;
        }
    }
}

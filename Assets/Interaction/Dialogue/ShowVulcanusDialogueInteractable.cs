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

        protected override bool Interact(GameCharacter instigator)
        {
            if (string.IsNullOrWhiteSpace(dialogueId))
            {
                Debug.LogWarning($"[ShowVulcanusDialogueInteractable] No dialogue id is assigned on '{gameObject.name}'.");
                return false;
            }

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

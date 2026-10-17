using System.Collections;
using Character;
using Core.Dialogue.Vulcanus;
using Interaction.Dialog;
using UnityEngine;
using UI.Shared;

namespace Interaction.Dialogue
{
    public class ShowVulcanusDialogueInteractable : AbstractInteractable
    {
        [SerializeField] private string dialogueId;
        [SerializeField] private DialogueOptions options = new();
        [SerializeField] private VulcanusDialogueRunner dialogueRunner;
        [SerializeField] private Transform dialogueTarget;
        [SerializeField] private bool autoFindRunner = true;
        [SerializeField] private bool emitLifecycleEvents = true;

        private Coroutine _activeMonitor;

        public string DialogueId => dialogueId;
        public DialogueOptions Options => options;

        protected override bool Interact(GameCharacter instigator)
        {
            if (string.IsNullOrWhiteSpace(dialogueId))
            {
                Debug.LogWarning($"[ShowVulcanusDialogueInteractable] No dialogue id is assigned on '{gameObject.name}'.");
                return false;
            }

            var runner = ResolveRunner();
            if (runner == null)
            {
                Debug.LogError($"[ShowVulcanusDialogueInteractable] No VulcanusDialogueRunner could be found for '{dialogueId}'.");
                return false;
            }

            if (runner.IsDialogueActive)
                return false;

            var pause = ScreenPauseMode.None;
            if (!options.CanMoveWhileTalking) pause |= ScreenPauseMode.Character;
            if (options.PauseGameClockWhileTalking) pause |= ScreenPauseMode.GameClock;
            if (!runner.StartDialogue(dialogueId, instigator, pause)) return false;

            if (emitLifecycleEvents)
            {
                var target = dialogueTarget != null ? dialogueTarget : transform;
                UrDialogueLifecycleEvent.Trigger(dialogueId, target, UrDialogueLifecycleEvent.UrDialogueLifecycleEventType.Started, options);
            }

            if (_activeMonitor != null)
                StopCoroutine(_activeMonitor);

            _activeMonitor = StartCoroutine(MonitorDialogue(runner));
            return true;
        }

        private VulcanusDialogueRunner ResolveRunner()
        {
            if (dialogueRunner != null)
                return dialogueRunner;

            if (!autoFindRunner)
                return null;

            dialogueRunner = VulcanusDialogueRunner.Instance != null
                ? VulcanusDialogueRunner.Instance
                : FindFirstObjectByType<VulcanusDialogueRunner>();
            return dialogueRunner;
        }

        private IEnumerator MonitorDialogue(VulcanusDialogueRunner runner)
        {
            yield return new WaitUntil(() => runner == null || !runner.IsDialogueActive);

            if (emitLifecycleEvents)
            {
                var target = dialogueTarget != null ? dialogueTarget : transform;
                UrDialogueLifecycleEvent.Trigger(dialogueId, target, UrDialogueLifecycleEvent.UrDialogueLifecycleEventType.Finished, options);
            }

            _activeMonitor = null;
        }

        protected override void OnDisable()
        {
            base.OnDisable();
            if (_activeMonitor != null)
            {
                StopCoroutine(_activeMonitor);
                _activeMonitor = null;
            }

        }
    }
}

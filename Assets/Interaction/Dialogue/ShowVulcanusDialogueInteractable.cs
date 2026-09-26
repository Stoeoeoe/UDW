using System.Collections;
using Character;
using Core.Dialogue.Vulcanus;
using Interaction.Dialog;
using UnityEngine;

namespace Interaction.Dialogue
{
    public class ShowVulcanusDialogueInteractable : BasicInteractable
    {
        [SerializeField] private string dialogueId;
        [SerializeField] private DialogueOptions options;
        [SerializeField] private VulcanusDialogueRunner dialogueRunner;
        [SerializeField] private Transform dialogueTarget;
        [SerializeField] private bool autoFindRunner = true;
        [SerializeField] private bool emitLifecycleEvents = true;

        private Coroutine _activeMonitor;
        private GameCharacter _frozenInstigator;

        public string DialogueId => dialogueId;
        public DialogueOptions Options => options;

        protected override void Interact(GameCharacter instigator)
        {
            if (string.IsNullOrWhiteSpace(dialogueId))
            {
                Debug.LogWarning($"[ShowVulcanusDialogueInteractable] No dialogue id is assigned on '{gameObject.name}'.");
                return;
            }

            var runner = ResolveRunner();
            if (runner == null)
            {
                Debug.LogError($"[ShowVulcanusDialogueInteractable] No VulcanusDialogueRunner could be found for '{dialogueId}'.");
                return;
            }

            if (runner.IsDialogueActive)
                return;

            if (!options.CanMoveWhileTalking)
            {
                instigator.Freeze();
                _frozenInstigator = instigator;
            }

            if (!runner.StartDialogue(dialogueId))
            {
                ReleaseInstigatorIfNeeded();
                return;
            }

            if (emitLifecycleEvents)
            {
                var target = dialogueTarget != null ? dialogueTarget : transform;
                UrDialogueLifecycleEvent.Trigger(dialogueId, target, UrDialogueLifecycleEvent.UrDialogueLifecycleEventType.Started, options);
            }

            if (_activeMonitor != null)
                StopCoroutine(_activeMonitor);

            _activeMonitor = StartCoroutine(MonitorDialogue(runner));
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

            ReleaseInstigatorIfNeeded();
            _activeMonitor = null;
        }

        private void OnDisable()
        {
            if (_activeMonitor != null)
            {
                StopCoroutine(_activeMonitor);
                _activeMonitor = null;
            }

            ReleaseInstigatorIfNeeded();
        }

        private void ReleaseInstigatorIfNeeded()
        {
            if (_frozenInstigator == null)
                return;

            _frozenInstigator.UnFreeze();
            _frozenInstigator = null;
        }
    }
}

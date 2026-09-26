using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace Core.Dialogue.Vulcanus
{
    public class VulcanusDebugDialoguePresenter : MonoBehaviour, IDialoguePresenter
    {
        public void OnDialogueStarted(VulcanusDialogueExecutionContext context)
        {
            Debug.Log($"[VulcanusDebugDialoguePresenter] Started dialogue '{context?.CurrentDialogue?.DialogueId}'.");
        }

        public IEnumerator PresentLine(VulcanusDialogueLineNode node, string localizedText, VulcanusDialogueExecutionContext context)
        {
            Debug.Log($"[VulcanusDebugDialoguePresenter] {node.Speaker}: {localizedText}");
            yield return null;
        }

        public IEnumerator PresentChoice(VulcanusDialogueChoiceNode node, IReadOnlyList<VulcanusDialogueChoiceOption> options,
            VulcanusDialogueExecutionContext context, Action<VulcanusDialogueChoiceOption> onSelected)
        {
            if (options.Count > 0)
            {
                Debug.Log($"[VulcanusDebugDialoguePresenter] Auto-selecting option '{options[0].Id}' for choice '{node.Id}'.");
                onSelected?.Invoke(options[0]);
            }

            yield return null;
        }

        public void OnDialogueFinished(VulcanusDialogueExecutionContext context)
        {
            Debug.Log($"[VulcanusDebugDialoguePresenter] Finished dialogue '{context?.CurrentDialogue?.DialogueId}'.");
        }
    }
}

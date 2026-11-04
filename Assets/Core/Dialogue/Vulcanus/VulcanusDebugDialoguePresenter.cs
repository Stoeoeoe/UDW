using System;
using System.Collections.Generic;
using System.Threading;
using UnityEngine;

namespace Core.Dialogue.Vulcanus
{
    /// <summary>Logs dialogue instead of showing it, answering every choice with its first option.</summary>
    public class VulcanusDebugDialoguePresenter : MonoBehaviour, IDialoguePresenter
    {
        public event Action Dismissed;

        public void OnDialogueStarted(VulcanusDialogueExecutionContext context)
        {
            Debug.Log($"[VulcanusDebugDialoguePresenter] Started dialogue '{context?.CurrentDialogue?.DialogueId}'.");
        }

        public async Awaitable PresentLine(VulcanusDialogueLineNode node, string localizedText,
            VulcanusDialogueExecutionContext context, CancellationToken cancellation)
        {
            Debug.Log($"[VulcanusDebugDialoguePresenter] {node.Speaker}: {localizedText}");
            await Awaitable.NextFrameAsync(cancellation);
        }

        public async Awaitable<VulcanusDialogueChoiceOption> PresentChoice(VulcanusDialogueChoiceNode node,
            IReadOnlyList<VulcanusDialogueChoiceOption> options, VulcanusDialogueExecutionContext context,
            CancellationToken cancellation)
        {
            await Awaitable.NextFrameAsync(cancellation);
            if (options.Count == 0) return null;
            Debug.Log($"[VulcanusDebugDialoguePresenter] Auto-selecting option '{options[0].Id}' for choice '{node.Id}'.");
            return options[0];
        }

        public void OnDialogueFinished(VulcanusDialogueExecutionContext context)
        {
            Debug.Log($"[VulcanusDebugDialoguePresenter] Finished dialogue '{context?.CurrentDialogue?.DialogueId}'.");
        }
    }
}

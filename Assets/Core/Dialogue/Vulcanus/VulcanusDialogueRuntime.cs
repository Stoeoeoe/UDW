using System;
using System.Collections.Generic;
using System.Threading;
using Character;
using Core.Tile.Vulcanus;
using UI.Shared;
using UnityEngine;

namespace Core.Dialogue.Vulcanus
{
    /// <summary>
    /// Presents dialogue to the player. Presentation methods complete when the player has finished with the node and
    /// throw <see cref="OperationCanceledException"/> when the runner stops the dialogue.
    /// </summary>
    public interface IDialoguePresenter
    {
        /// <summary>Raised when the player or the game closes the dialogue screen, ending any running dialogue.</summary>
        event Action Dismissed;
        void OnDialogueStarted(VulcanusDialogueExecutionContext context);
        Awaitable PresentLine(VulcanusDialogueLineNode node, string localizedText, VulcanusDialogueExecutionContext context,
            CancellationToken cancellation);
        Awaitable<VulcanusDialogueChoiceOption> PresentChoice(VulcanusDialogueChoiceNode node,
            IReadOnlyList<VulcanusDialogueChoiceOption> options, VulcanusDialogueExecutionContext context,
            CancellationToken cancellation);
        void OnDialogueFinished(VulcanusDialogueExecutionContext context);
    }

    public interface IDialogueAdvanceHandler
    {
        bool TryAdvanceDialogue();
    }

    public class VulcanusDialogueExecutionContext
    {
        public VulcanusProject Project { get; internal set; }
        public VulcanusDialogueAsset CurrentDialogue { get; internal set; }
        public VulcanusDialogueNode CurrentNode { get; internal set; }
        public int StepsExecuted { get; internal set; }
        public GameCharacter Instigator { get; internal set; }
        public ScreenPauseMode? PauseWhileOpen { get; internal set; }
    }
}

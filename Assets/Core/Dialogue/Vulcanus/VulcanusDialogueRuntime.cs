using System;
using System.Collections;
using System.Collections.Generic;
using Core.Tile.Vulcanus;
using UnityEngine;

namespace Core.Dialogue.Vulcanus
{
    public interface IDialogueContextResolver
    {
        object ResolveSelf(VulcanusProject project, VulcanusDialogueAsset dialogue);
        bool TryResolveContextType(VulcanusProject project, VulcanusDialogueAsset dialogue,
            out VulcanusProject.ScriptContextTypeDefinition contextType);
    }

    public interface IDialoguePresenter
    {
        void OnDialogueStarted(VulcanusDialogueExecutionContext context);
        IEnumerator PresentLine(VulcanusDialogueLineNode node, string localizedText, VulcanusDialogueExecutionContext context);
        IEnumerator PresentChoice(VulcanusDialogueChoiceNode node, IReadOnlyList<VulcanusDialogueChoiceOption> options,
            VulcanusDialogueExecutionContext context, Action<VulcanusDialogueChoiceOption> onSelected);
        void OnDialogueFinished(VulcanusDialogueExecutionContext context);
    }

    public interface IDialogueAdvanceHandler
    {
        bool TryAdvanceDialogue();
    }

    [Serializable]
    public class VulcanusDialogueExecutionContext
    {
        public VulcanusDialogueDatabase Database { get; internal set; }
        public VulcanusProject Project { get; internal set; }
        public VulcanusDialogueAsset CurrentDialogue { get; internal set; }
        public VulcanusDialogueNode CurrentNode { get; internal set; }
        public object Self { get; internal set; }
        public int StepsExecuted { get; internal set; }
    }
}

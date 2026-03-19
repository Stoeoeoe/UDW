using System.Collections;
using Core.Context;
using MoreMountains.Feedbacks;
using UnityEngine;

namespace Interaction.Tools
{
    /// <summary>
    /// Delegates tool usage to the appropriate ToolAction based on the equipped tool.
    /// This action serves as a dispatcher that routes to specific tool actions.
    /// Handles tile caching, highlighting, and feedback coordination.
    /// </summary>
    public class UseToolAction : PrimaryAction
    {
        private ToolAction _activeToolAction;

        private ToolAction ActiveToolAction => Owner.ToolActionRegistry.GetToolAction(CurrentTool);
        public ToolData CurrentTool => Owner?.CurrentTool;

        public override bool HasPreparationPhase => true;
        public override float CooldownTime => CurrentTool.cooldownDuration;
        public override float ActionDuration => CurrentTool.actionDuration;

        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot)
        {
            var toolAction = ActiveToolAction;
            return toolAction && toolAction.CanExecute(snapshot);
        }

        public override bool CanExecuteAfterPreparation(PlayerInteractionContextSnapshot snapshot)
        {
            var toolAction = ActiveToolAction;
            return toolAction && toolAction.CanExecuteAfterPreparation(snapshot);
        }

        public override IEnumerator OnPrepare(PlayerInteractionContextSnapshot snapshot)
        {
            _activeToolAction = ActiveToolAction;
            if (!_activeToolAction)
                yield break;

            _activeToolAction.gameObject.SetActive(true);
            
            // Cache affected tiles once for the entire action lifecycle
            _activeToolAction.CacheAffectedTiles(snapshot);

            // Show tile highlighter using cached tiles
            if (CurrentTool.showTileHighlighterOnPrepare)
            {
                snapshot.Character.TileHighlighter?.SetTiles(_activeToolAction.AffectedTiles);
                snapshot.Character.TileHighlighter?.Show();
            }

            yield return _activeToolAction.OnPrepare(snapshot);
            PlayFeedback(_activeToolAction.PrepareFeedback, _activeToolAction, snapshot);
        }

        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            var toolAction = _activeToolAction ?? ActiveToolAction;
            if (!toolAction)
                yield break;

            if (CurrentTool.showTileHighlighterOnPrepare)
            {
                toolAction.HideTileHighlighter(snapshot);
            }

            PlayFeedback(toolAction.ExecuteFeedback, toolAction, snapshot);
            Owner.ConsumeEnergy(CurrentTool.energyCost);
            
            yield return toolAction.OnExecute(snapshot);
        }

        public override IEnumerator OnFinish(PlayerInteractionContextSnapshot snapshot)
        {
            var toolAction = _activeToolAction ?? ActiveToolAction;
            if (toolAction)
            {
                yield return toolAction.OnFinish(snapshot);
                PlayFeedback(toolAction.FinishFeedback, toolAction, snapshot);
                CleanupToolAction(toolAction);
            }
            _activeToolAction = null;
        }

        public override IEnumerator OnFailure(PlayerInteractionContextSnapshot snapshot)
        {
            var toolAction = ActiveToolAction;
            if (toolAction)
            {
                if (toolAction.ToolData.consumeEnergyOnFailure)
                {
                    Owner.ConsumeEnergy(CurrentTool.energyCost);
                }
                yield return toolAction.OnFailure(snapshot);
            }
        }

        public override IEnumerator OnPostPrepareFailure(PlayerInteractionContextSnapshot snapshot)
        {
            var toolAction = _activeToolAction ?? ActiveToolAction;
            if (toolAction)
            {
                yield return toolAction.OnPostPrepareFailure(snapshot);
                CleanupToolAction(toolAction);
            }
            _activeToolAction = null;
        }

        public override Vector2 GetActionExecutionLocation(PlayerInteractionContextSnapshot snapshot)
        {
            var toolAction = _activeToolAction ?? ActiveToolAction;
            return toolAction
                ? toolAction.GetActionExecutionLocation(snapshot)
                : base.GetActionExecutionLocation(snapshot);
        }

        /// <summary>
        /// Cleans up the tool action after use - clears cache and deactivates.
        /// </summary>
        private void CleanupToolAction(ToolAction toolAction)
        {
            toolAction.ClearCachedTiles();
            toolAction.gameObject.SetActive(false);
        }

        /// <summary>
        /// Plays feedback either per affected tile or once at the tool's execution location.
        /// Uses cached tiles to avoid redundant calculations.
        /// </summary>
        private void PlayFeedback(MMFeedbacks feedback, ToolAction toolAction, PlayerInteractionContextSnapshot snapshot)
        {
            if (!feedback || !toolAction) return;

            if (toolAction.ExecuteFeedbackPerAffectedTile)
            {
                foreach (var tile in toolAction.AffectedTiles)
                {
                    feedback.PlayFeedbacks(tile.WorldPosition);
                }
            }
            else
            {
                feedback.PlayFeedbacks(toolAction.GetActionExecutionLocation(snapshot));
            }
        }
    }
}
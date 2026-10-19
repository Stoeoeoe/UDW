using System.Collections;
using Core.Context;
using MoreMountains.Feedbacks;
using UnityEngine;

namespace Interaction.Tools
{
    /// <summary>Delegates one tool attempt and its presentation; ActionExecutor owns completion and cleanup timing.</summary>
    public class UseToolAction : PrimaryAction
    {
        private ToolAction _toolAction;
        public ToolData CurrentTool => Owner.CurrentTool;

        public override bool HasPreparationPhase => true;
        public override float CooldownTime => _toolAction.ToolData.cooldownDuration;
        public override float ActionDuration => _toolAction.ToolData.actionDuration;

        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot)
        {
            _toolAction = Owner.ToolActionRegistry.GetToolAction(CurrentTool);
            return _toolAction.CanExecute(snapshot);
        }

        public override bool CanExecuteAfterPreparation(PlayerInteractionContextSnapshot snapshot)
        {
            // Release commits the final aim. Feedback, resource costs and execution share these targets.
            _toolAction.CaptureTargets(snapshot);
            return _toolAction.CanExecuteAfterPreparation(snapshot);
        }

        public override IEnumerator OnPrepare(PlayerInteractionContextSnapshot snapshot)
        {
            _toolAction.gameObject.SetActive(true);
            _toolAction.CaptureTargets(snapshot);
            if (_toolAction.ToolData.showTileHighlighterOnPrepare && snapshot.Character.TileHighlighter)
            {
                snapshot.Character.TileHighlighter.SetTiles(_toolAction.AffectedTiles);
                snapshot.Character.TileHighlighter.Show();
            }
            yield return _toolAction.OnPrepare(snapshot);
            PlayFeedback(_toolAction.PrepareFeedback, snapshot);
        }

        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            _toolAction.HideTileHighlighter(snapshot);
            PlayFeedback(_toolAction.ExecuteFeedback, snapshot);
            Owner.Stamina.ConsumeStamina(_toolAction.StaminaCost);
            yield return _toolAction.OnExecute(snapshot);
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot) => _toolAction.Interrupt(snapshot);

        public override IEnumerator OnFinish(PlayerInteractionContextSnapshot snapshot)
        {
            yield return _toolAction.OnFinish(snapshot);
            PlayFeedback(_toolAction.FinishFeedback, snapshot);
        }

        public override void OnEnd(PlayerInteractionContextSnapshot snapshot)
        {
            _toolAction.HideTileHighlighter(snapshot);
            _toolAction.OnEnd(snapshot);
            _toolAction.ClearCapturedTargets();
            _toolAction.gameObject.SetActive(false);
        }

        public override IEnumerator OnFailure(PlayerInteractionContextSnapshot snapshot)
        {
            if (_toolAction.ToolData.consumeStaminaOnFailure)
                Owner.Stamina.ConsumeStamina(_toolAction.StaminaCost);
            yield return _toolAction.OnFailure(snapshot);
        }

        public override IEnumerator OnPostPrepareFailure(PlayerInteractionContextSnapshot snapshot) =>
            _toolAction.OnPostPrepareFailure(snapshot);

        public override Vector2 GetActionExecutionLocation(PlayerInteractionContextSnapshot snapshot) =>
            _toolAction.GetActionExecutionLocation(snapshot);

        private void PlayFeedback(MMFeedbacks feedback, PlayerInteractionContextSnapshot snapshot)
        {
            if (!feedback) return;
            if (_toolAction.ExecuteFeedbackPerAffectedTile)
            {
                foreach (var tile in _toolAction.AffectedTiles)
                    feedback.PlayFeedbacks(tile.WorldPosition);
            }
            else
                feedback.PlayFeedbacks(_toolAction.GetActionExecutionLocation(snapshot));
        }
    }
}

using System.Threading;
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

        public override async Awaitable OnPrepare(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            _toolAction.gameObject.SetActive(true);
            _toolAction.CaptureTargets(snapshot);
            if (_toolAction.ToolData.showTileHighlighterOnPrepare && snapshot.Character.TileHighlighter)
            {
                snapshot.Character.TileHighlighter.SetTiles(_toolAction.AffectedTiles);
                snapshot.Character.TileHighlighter.Show();
            }
            await _toolAction.OnPrepare(snapshot, cancellation);
            cancellation.ThrowIfCancellationRequested();
            PlayFeedback(_toolAction.PrepareFeedback, snapshot);
        }

        public override async Awaitable OnExecute(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            _toolAction.HideTileHighlighter(snapshot);
            PlayFeedback(_toolAction.ExecuteFeedback, snapshot);
            Owner.Stamina.ConsumeStamina(_toolAction.StaminaCost);
            cancellation.ThrowIfCancellationRequested(); // Exhaustion can start an overnight transition.
            await _toolAction.OnExecute(snapshot, cancellation);
            cancellation.ThrowIfCancellationRequested();
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot) => _toolAction.Interrupt(snapshot);

        public override async Awaitable OnFinish(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            await _toolAction.OnFinish(snapshot, cancellation);
            cancellation.ThrowIfCancellationRequested();
            PlayFeedback(_toolAction.FinishFeedback, snapshot);
        }

        public override void OnEnd(PlayerInteractionContextSnapshot snapshot)
        {
            _toolAction.HideTileHighlighter(snapshot);
            _toolAction.OnEnd(snapshot);
            _toolAction.ClearCapturedTargets();
            _toolAction.gameObject.SetActive(false);
        }

        public override async Awaitable OnFailure(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            if (_toolAction.ToolData.consumeStaminaOnFailure)
                Owner.Stamina.ConsumeStamina(_toolAction.StaminaCost);
            await _toolAction.OnFailure(snapshot, cancellation);
            cancellation.ThrowIfCancellationRequested();
        }

        public override Awaitable OnPostPrepareFailure(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation) =>
            _toolAction.OnPostPrepareFailure(snapshot, cancellation);

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

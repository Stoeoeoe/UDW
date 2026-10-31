using System;
using System.Threading;
using Character;
using Core.Context;
using MoreMountains.Feedbacks;
using UnityEngine;

namespace Interaction
{
    /// <summary>Owns an action attempt from preparation through cooldown, cancellation and cleanup.</summary>
    public class ActionExecutor
    {
        public AbstractAction CurrentAction { get; private set; }
        private ActionExecutionState _state = ActionExecutionState.Idle;
        public event Action StateChanged;
        public ActionExecutionState State
        {
            get => _state;
            private set
            {
                if (_state == value) return;
                _state = value;
                StateChanged?.Invoke();
            }
        }
        public bool IsIdle => CurrentAction == null;

        private readonly GameCharacter _owner;
        private readonly Func<PlayerInteractionContextSnapshot> _snapshotProvider;
        private CancellationTokenSource _attempt;
        private AwaitableCompletionSource _preparationReleased;
        private bool _frozeCharacter;
        private PlayerInteractionContextSnapshot _currentSnapshot;

        public ActionExecutor(GameCharacter owner, Func<PlayerInteractionContextSnapshot> snapshotProvider)
        {
            _owner = owner ? owner : throw new ArgumentNullException(nameof(owner));
            _snapshotProvider = snapshotProvider;
        }

        /// <summary>Runs one attempt. Expected interruption completes normally after releasing its resources.</summary>
        public async Awaitable RunAsync(AbstractAction action, bool skipPrepare = false)
        {
            if (!IsIdle) return;
            RefreshSnapshot();
            if (!_currentSnapshot.CanInteractWithWorld) return;

            using var attempt = new CancellationTokenSource();
            var cancellation = attempt.Token;
            _attempt = attempt;
            CurrentAction = action;
            try
            {
                if (!action.CanExecute(_currentSnapshot))
                {
                    await RunPhase(action.FailureFeedback, action.OnFailure, cancellation);
                    return;
                }

                cancellation.ThrowIfCancellationRequested();
                FreezeIfNeeded(action);
                cancellation.ThrowIfCancellationRequested();
                if (!skipPrepare && action.HasPreparationPhase)
                {
                    var released = _preparationReleased = new AwaitableCompletionSource();
                    using var registration = cancellation.Register(() => released.TrySetCanceled());
                    State = ActionExecutionState.Preparing;
                    await RunPhase(action.PrepareFeedback, action.OnPrepare, cancellation);
                    await released.Awaitable;
                    cancellation.ThrowIfCancellationRequested();
                    _preparationReleased = null;
                }

                // Release commits the final aim, after any preparation callbacks have finished.
                RefreshSnapshot();
                if (!_currentSnapshot.CanInteractWithWorld) return;
                if (!action.CanExecuteAfterPreparation(_currentSnapshot))
                {
                    await RunPhase(action.PostPrepareFailureFeedback, action.OnPostPrepareFailure, cancellation);
                    return;
                }

                cancellation.ThrowIfCancellationRequested();
                State = ActionExecutionState.Executing;
                await RunPhase(action.ExecuteFeedback, action.OnExecute, cancellation);
                if (action.ActionDuration > 0)
                    await Awaitable.WaitForSecondsAsync(action.ActionDuration, cancellation);
                await RunPhase(action.FinishFeedback, action.OnFinish, cancellation);

                Unfreeze();
                cancellation.ThrowIfCancellationRequested();
                if (action.CooldownTime > 0)
                {
                    State = ActionExecutionState.Cooldown;
                    cancellation.ThrowIfCancellationRequested();
                    await Awaitable.WaitForSecondsAsync(action.CooldownTime, cancellation);
                }
            }
            catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
            finally { EndAttempt(attempt); }
        }

        private async Awaitable RunPhase(MMFeedbacks feedback,
            Func<PlayerInteractionContextSnapshot, CancellationToken, Awaitable> phase, CancellationToken cancellation)
        {
            cancellation.ThrowIfCancellationRequested();
            if (feedback) feedback.PlayFeedbacks(CurrentAction.GetActionExecutionLocation(_currentSnapshot));
            cancellation.ThrowIfCancellationRequested();
            await phase(_currentSnapshot, cancellation);
            cancellation.ThrowIfCancellationRequested();
        }

        private void RefreshSnapshot() => _currentSnapshot = _snapshotProvider();

        private void FreezeIfNeeded(AbstractAction action)
        {
            if (!action.FreezeCharacterDuringAction) return;
            _frozeCharacter = true;
            _owner.SetControlBlocked(this, true);
        }

        private void Unfreeze()
        {
            if (!_frozeCharacter) return;
            _frozeCharacter = false;
            if (_owner) _owner.SetControlBlocked(this, false);
        }

        public void ContinueFromPrepare()
        {
            if (State != ActionExecutionState.Preparing) return;
            var released = _preparationReleased;
            State = ActionExecutionState.Executing;
            released.TrySetResult();
        }

        private void EndAttempt(CancellationTokenSource attempt)
        {
            if (!ReferenceEquals(_attempt, attempt)) return;
            // Detach before cleanup callbacks can re-enter interruption. Remain busy until cleanup finishes.
            _attempt = null;
            try { CurrentAction.OnEnd(_currentSnapshot); }
            finally
            {
                Unfreeze();
                CurrentAction = null;
                _currentSnapshot = null;
                _preparationReleased = null;
                State = ActionExecutionState.Idle;
            }
        }

        public void InterruptCurrentAction()
        {
            var attempt = _attempt;
            if (attempt == null) return;
            try { CurrentAction.Interrupt(_currentSnapshot); }
            finally
            {
                try { attempt.Cancel(); }
                finally { EndAttempt(attempt); }
            }
        }

        public override string ToString() => $"ActionExecutor(State={State}, Action={CurrentAction?.ActionName})";
    }
}


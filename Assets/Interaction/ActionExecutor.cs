using System;
using System.Collections;
using Character;
using Core.Context;
using MoreMountains.Feedbacks;
using UnityEngine;

namespace Interaction
{
    /// <summary>
    /// Executes actions through their full lifecycle: Prepare -> Execute -> Cooldown -> Finish.
    /// Handles feedbacks and character freezing during action execution.
    /// </summary>
    public class ActionExecutor
    {
        public AbstractAction CurrentAction { get; private set; }
        public ActionExecutionState State { get; private set; } = ActionExecutionState.Idle;
        public bool IsIdle => State == ActionExecutionState.Idle;

        private readonly UrCharacter _owner;
        private readonly Func<PlayerInteractionContextSnapshot> _snapshotProvider;
        private bool _frozeCharacter;

        // Cached snapshot - refreshed only when context might have changed
        private PlayerInteractionContextSnapshot _currentSnapshot;

        public ActionExecutor(UrCharacter owner, Func<PlayerInteractionContextSnapshot> snapshotProvider)
        {
            _owner = owner;
            _snapshotProvider = snapshotProvider;
        }

        /// <summary>
        /// Runs the full action lifecycle: Prepare -> (wait for trigger) -> Execute -> Cooldown -> Finish
        /// </summary>
        public IEnumerator Run(AbstractAction action, bool skipPrepare = false)
        {
            if (!IsIdle) yield break;

            RefreshSnapshot();

            if (!action.CanExecute(_currentSnapshot))
            {
                yield return RunPhase(action.FailureFeedback, action.OnFailure);
                yield break;
            }

            CurrentAction = action;
            FreezeIfNeeded(action);

            if (!skipPrepare && action.HasPreparationPhase)
            {
                yield return RunPreparePhase(action);
            }

            // Context may have changed during preparation (player moved aim, etc.)
            RefreshSnapshot();

            if (!action.CanExecuteAfterPreparation(_currentSnapshot))
            {
                yield return RunPhase(action.PostPrepareFailureFeedback, action.OnPostPrepareFailure);
                Cleanup();
                yield break;
            }

            yield return RunExecutePhase(action);
            yield return RunFinishPhase(action);

            Unfreeze();

            if (action.CooldownTime > 0)
            {
                State = ActionExecutionState.Cooldown;
                yield return new WaitForSeconds(action.CooldownTime);
            }

            Reset();
        }

        private IEnumerator RunPreparePhase(AbstractAction action)
        {
            State = ActionExecutionState.Preparing;
            yield return RunPhase(action.PrepareFeedback, action.OnPrepare);
            yield return new WaitUntil(() => State != ActionExecutionState.Preparing);
        }

        private IEnumerator RunExecutePhase(AbstractAction action)
        {
            State = ActionExecutionState.Executing;
            yield return RunPhase(action.ExecuteFeedback, action.OnExecute);

            if (action.ActionDuration > 0)
                yield return new WaitForSeconds(action.ActionDuration);
        }

        private IEnumerator RunFinishPhase(AbstractAction action)
        {
            yield return RunPhase(action.FinishFeedback, action.OnFinish);
        }

        /// <summary>
        /// Runs a single phase: plays feedback, then executes the phase callback.
        /// </summary>
        private IEnumerator RunPhase(MMFeedbacks feedback, Func<PlayerInteractionContextSnapshot, IEnumerator> phaseCallback)
        {
            PlayFeedback(feedback);
            yield return phaseCallback(_currentSnapshot);
        }

        private void PlayFeedback(MMFeedbacks feedback)
        {
            feedback?.PlayFeedbacks(CurrentAction.GetActionExecutionLocation(_currentSnapshot));
        }

        private void RefreshSnapshot() => _currentSnapshot = _snapshotProvider();

        private void FreezeIfNeeded(AbstractAction action)
        {
            _frozeCharacter = false;
            if (action.FreezeCharacterDuringAction)
            {
                _owner.Freeze();
                _frozeCharacter = true;
            }
        }

        private void Unfreeze()
        {
            if (_frozeCharacter)
            {
                _owner.UnFreeze();
                _frozeCharacter = false;
            }
        }

        public void ContinueFromPrepare()
        {
            if (State == ActionExecutionState.Preparing)
                State = ActionExecutionState.Executing;
        }

        public void Cancel()
        {
            Cleanup();
            Reset();
        }

        private void Cleanup() => Unfreeze();

        private void Reset()
        {
            CurrentAction = null;
            State = ActionExecutionState.Idle;
            _currentSnapshot = null;
        }

        public override string ToString() => $"ActionExecutor(State={State}, Action={CurrentAction?.ActionName})";
    }
}


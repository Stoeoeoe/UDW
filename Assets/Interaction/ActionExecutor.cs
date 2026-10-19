using System;
using System.Collections;
using Character;
using Core.Context;
using MoreMountains.Feedbacks;
using UnityEngine;

namespace Interaction
{
    /// <summary>
    /// Executes actions through preparation, execution, finish and cooldown, then releases their resources.
    /// Handles feedbacks and character freezing during action execution.
    /// </summary>
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
        private bool _frozeCharacter;

        private PlayerInteractionContextSnapshot _currentSnapshot;

        /// <summary>Runs actions for one character using the current world-interaction context.</summary>
        public ActionExecutor(GameCharacter owner, Func<PlayerInteractionContextSnapshot> snapshotProvider)
        {
            _owner = owner ? owner : throw new ArgumentNullException(nameof(owner));
            _snapshotProvider = snapshotProvider;
        }

        /// <summary>
        /// Runs an attempt, waiting for preparation release and retaining ownership until cleanup completes.
        /// </summary>
        public IEnumerator Run(AbstractAction action, bool skipPrepare = false)
        {
            if (!IsIdle) yield break;

            RefreshSnapshot();

            if (!_currentSnapshot.CanInteractWithWorld) yield break;

            CurrentAction = action;
            try
            {
                if (!action.CanExecute(_currentSnapshot))
                {
                    yield return RunPhase(action.FailureFeedback, action.OnFailure);
                    yield break;
                }

                FreezeIfNeeded(action);
                if (!skipPrepare && action.HasPreparationPhase)
                    yield return RunPreparePhase(action);

                // Release captures the final context after preparation/aiming.
                RefreshSnapshot();
                if (!_currentSnapshot.CanInteractWithWorld) yield break;
                if (!action.CanExecuteAfterPreparation(_currentSnapshot))
                {
                    yield return RunPhase(action.PostPrepareFailureFeedback, action.OnPostPrepareFailure);
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
            }
            finally
            {
                // Explicit interruption may already have ended this attempt before its iterator is disposed.
                if (CurrentAction == action) EndAttempt();
            }
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
            if (feedback) feedback.PlayFeedbacks(CurrentAction.GetActionExecutionLocation(_currentSnapshot));
        }

        private void RefreshSnapshot() => _currentSnapshot = _snapshotProvider();

        private void FreezeIfNeeded(AbstractAction action)
        {
            _frozeCharacter = false;
            if (!action.FreezeCharacterDuringAction) return;
            _owner.SetControlBlocked(this, true);
            _frozeCharacter = true;
        }

        private void Unfreeze()
        {
            if (!_frozeCharacter) return;
            if (_owner) _owner.SetControlBlocked(this, false); // Owner may have been destroyed during a scene transition.
            _frozeCharacter = false;
        }

        public void ContinueFromPrepare()
        {
            if (State == ActionExecutionState.Preparing)
                State = ActionExecutionState.Executing;
        }

        private void EndAttempt()
        {
            if (!CurrentAction) return;
            try { CurrentAction.OnEnd(_currentSnapshot); }
            finally
            {
                Unfreeze();
                Reset();
            }
        }

        private void Reset()
        {
            CurrentAction = null;
            _currentSnapshot = null;
            State = ActionExecutionState.Idle;
        }
        
        public void InterruptCurrentAction()
        {
            try
            {
                if (CurrentAction) CurrentAction.Interrupt(_currentSnapshot);
            }
            finally { EndAttempt(); }
        }


        public override string ToString() => $"ActionExecutor(State={State}, Action={CurrentAction?.ActionName})";
    }
}


using System;
using System.Collections;
using System.Collections.Generic;
using Character;
using Core.Common.Editor;
using Core.Context;
using NUnit.Framework;
using UnityEngine;

namespace Interaction.Editor
{
    /// <summary>Checks that every accepted or rejected attempt releases ownership exactly once.</summary>
    public sealed class ActionExecutorTests
    {
        private GameTestFixture _fixture;
        private MainCharacter _character;
        private LifecycleTestAction _action;
        private ActionExecutor _executor;
        private PlayerInteractionContextSnapshot _snapshot;

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Action lifecycle");
            _character = _fixture.CreateCharacter();
            _action = _fixture.Root.AddComponent<LifecycleTestAction>();
            _action.Initialize(_character);
            _snapshot = PlayerInteractionContextSnapshot.Empty() with { SceneReady = true, Character = _character };
            _executor = new ActionExecutor(_character, () => _snapshot);
        }

        [TearDown] public void TearDown() => _fixture.Dispose();

        [TestCase(true, true, true, 1)]
        [TestCase(false, true, true, 0)]
        [TestCase(true, false, true, 0)]
        [TestCase(true, true, false, 0)]
        public void SuccessAndRejectionsEndTheAttemptOnce(bool allowed, bool allowedAfterPreparation, bool worldReadyOnRelease, int executions)
        {
            _action.Allowed = allowed;
            _action.AllowedAfterPreparation = allowedAfterPreparation;
            var steps = new Stack<IEnumerator>();
            steps.Push(_executor.Run(_action));
            while (steps.Count > 0)
            {
                var step = steps.Peek();
                if (!step.MoveNext()) { steps.Pop(); continue; }
                if (step.Current is WaitUntil)
                {
                    _snapshot = _snapshot with { SceneReady = worldReadyOnRelease };
                    _executor.ContinueFromPrepare();
                }
                if (step.Current is IEnumerator nested) steps.Push(nested);
            }
            Assert.That(_action.Executions, Is.EqualTo(executions));
            Assert.That(_action.Finishes, Is.EqualTo(executions));
            AssertEnded();
        }

        [Test]
        public void InterruptingPreparationAndDisposingTheStoppedRoutineEndsOnlyOnce()
        {
            var routine = _executor.Run(_action);
            Assert.That(routine.MoveNext(), Is.True);
            var preparation = (IEnumerator)routine.Current;
            Assert.That(preparation.MoveNext(), Is.True);
            Assert.That(_executor.State, Is.EqualTo(ActionExecutionState.Preparing));
            Assert.That(_character.IsControlBlocked, Is.True);
            _executor.InterruptCurrentAction();
            ((IDisposable)preparation).Dispose();
            ((IDisposable)routine).Dispose();
            _executor.InterruptCurrentAction();
            Assert.That(_action.Interruptions, Is.EqualTo(1));
            Assert.That(_action.Executions, Is.Zero);
            AssertEnded();
        }

        private void AssertEnded()
        {
            Assert.That(_action.Ends, Is.EqualTo(1));
            Assert.That(_executor.CurrentAction, Is.Null);
            Assert.That(_executor.IsIdle, Is.True);
            Assert.That(_executor.State, Is.EqualTo(ActionExecutionState.Idle));
            Assert.That(_character.IsControlBlocked, Is.False);
        }
    }

    /// <summary>Records lifecycle callbacks without gameplay effects for executor tests.</summary>
    public sealed class LifecycleTestAction : AbstractAction
    {
        public bool Allowed = true, AllowedAfterPreparation = true;
        public int Executions, Finishes, Interruptions, Ends;
        public override bool HasPreparationPhase => true;
        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot) => Allowed;
        public override bool CanExecuteAfterPreparation(PlayerInteractionContextSnapshot snapshot) => AllowedAfterPreparation;
        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot) { Executions++; yield break; }
        public override IEnumerator OnFinish(PlayerInteractionContextSnapshot snapshot) { Finishes++; yield break; }
        public override void Interrupt(PlayerInteractionContextSnapshot snapshot) => Interruptions++;
        public override void OnEnd(PlayerInteractionContextSnapshot snapshot) => Ends++;
    }
}

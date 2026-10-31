using System;
using System.Threading;
using System.Threading.Tasks;
using Character;
using Core.Common.Editor;
using Core.Context;
using NUnit.Framework;
using UnityEngine;

namespace Interaction.Editor
{
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

        [TearDown]
        public void TearDown()
        {
            _executor.InterruptCurrentAction();
            _fixture.Dispose();
        }

        [TestCase(true, true, true, 1)]
        [TestCase(false, true, true, 0)]
        [TestCase(true, false, true, 0)]
        [TestCase(true, true, false, 0)]
        public async Task SuccessAndRejectionsEndTheAttemptOnce(bool allowed, bool allowedAfterPreparation, bool worldReadyOnRelease, int executions)
        {
            _action.Allowed = allowed;
            _action.AllowedAfterPreparation = allowedAfterPreparation;
            var run = _executor.RunAsync(_action);
            if (allowed)
            {
                Assert.That(_executor.State, Is.EqualTo(ActionExecutionState.Preparing));
                _snapshot = _snapshot with { SceneReady = worldReadyOnRelease };
                _executor.ContinueFromPrepare();
            }
            await run;
            Assert.That(_action.Executions, Is.EqualTo(executions));
            Assert.That(_action.Finishes, Is.EqualTo(executions));
            AssertEnded();
        }

        [Test]
        public async Task InterruptingPreparationEndsOnceWithoutExecuting()
        {
            var run = _executor.RunAsync(_action);
            Assert.That(_character.IsControlBlocked, Is.True);
            _executor.InterruptCurrentAction();
            AssertEnded();
            _executor.InterruptCurrentAction();
            await run;
            Assert.That(_action.Interruptions, Is.EqualTo(1));
            Assert.That(_action.Executions, Is.Zero);
            AssertEnded();
        }

        [Test]
        public async Task CancellationDuringExecutionCannotFinishOrCleanUpAReplacementAttempt()
        {
            var first = _action.Execution = new AwaitableCompletionSource();
            var old = _executor.RunAsync(_action, skipPrepare: true);
            Awaitable replacement = null;
            var restarted = false;
            void Restart()
            {
                if (_executor.State != ActionExecutionState.Idle || restarted) return;
                restarted = true;
                _action.Execution = new AwaitableCompletionSource();
                replacement = _executor.RunAsync(_action, skipPrepare: true);
            }
            _executor.StateChanged += Restart;
            _executor.InterruptCurrentAction();
            _executor.StateChanged -= Restart;
            await old;
            Assert.That(restarted, Is.True);
            Assert.That(_executor.CurrentAction, Is.SameAs(_action));
            Assert.That(_character.IsControlBlocked, Is.True);
            Assert.That(first.TrySetResult(), Is.False);
            Assert.That(_action.Ends, Is.EqualTo(1));
            Assert.That(_action.Finishes, Is.Zero);
            _action.Execution.SetResult();
            await replacement;
            Assert.That(_action.Ends, Is.EqualTo(2));
            Assert.That(_action.Finishes, Is.EqualTo(1));
            Assert.That(_executor.IsIdle, Is.True);
        }

        [Test]
        public async Task ExecutionFailureReleasesOwnershipBeforeReportingTheError()
        {
            _action.FailExecution = true;
            var run = _executor.RunAsync(_action, skipPrepare: true);
            try { await run; Assert.Fail("Execution must report the action failure."); }
            catch (InvalidOperationException error) { Assert.That(error.Message, Is.EqualTo("Action failure")); }
            Assert.That(_action.Finishes, Is.Zero);
            AssertEnded();
        }

        [Test]
        public async Task InterruptionFromASynchronousExecutionCallbackReleasesOwnershipImmediately()
        {
            _action.ExecutionStarted = () =>
            {
                _executor.InterruptCurrentAction();
                Assert.That(_executor.IsIdle, Is.True);
                Assert.That(_character.IsControlBlocked, Is.False);
            };
            await _executor.RunAsync(_action, skipPrepare: true);
            Assert.That(_action.Interruptions, Is.EqualTo(1));
            Assert.That(_action.Finishes, Is.Zero);
            AssertEnded();
        }

        [Test]
        public async Task ReleaseDuringPreparationWaitRetainsTheSignalAndCapturesFinalContext()
        {
            _action.Preparation = new AwaitableCompletionSource();
            var run = _executor.RunAsync(_action);
            _executor.ContinueFromPrepare();
            Assert.That(_action.Executions, Is.Zero);
            _snapshot = _snapshot with { SceneReady = false };
            _action.Preparation.SetResult();
            await run;
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

    public sealed class LifecycleTestAction : AbstractAction
    {
        public bool Allowed = true, AllowedAfterPreparation = true, FailExecution;
        public int Executions, Finishes, Interruptions, Ends;
        public Action ExecutionStarted;
        public AwaitableCompletionSource Preparation, Execution;
        public override bool HasPreparationPhase => true;
        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot) => Allowed;
        public override bool CanExecuteAfterPreparation(PlayerInteractionContextSnapshot snapshot) => AllowedAfterPreparation;
        public override async Awaitable OnPrepare(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            if (Preparation == null) return;
            using var registration = cancellation.Register(() => Preparation.TrySetCanceled());
            await Preparation.Awaitable;
        }
        public override async Awaitable OnExecute(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            Executions++;
            ExecutionStarted?.Invoke();
            if (FailExecution) throw new InvalidOperationException("Action failure");
            var execution = Execution;
            if (execution == null) return;
            using var registration = cancellation.Register(() => execution.TrySetCanceled());
            await execution.Awaitable;
        }
        public override Awaitable OnFinish(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation) { Finishes++; return Completed(); }
        public override void Interrupt(PlayerInteractionContextSnapshot snapshot) => Interruptions++;
        public override void OnEnd(PlayerInteractionContextSnapshot snapshot) => Ends++;
    }
}

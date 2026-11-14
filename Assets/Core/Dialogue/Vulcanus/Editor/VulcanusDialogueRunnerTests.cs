using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using Core.Common.Editor;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace Core.Dialogue.Vulcanus.Editor
{
    /// <summary>
    /// The dialogue flow is a plain service: these tests drive it with a fake presenter and the real Lua runtime,
    /// without a scene, UI document, camera, input or player.
    /// </summary>
    public sealed class VulcanusDialogueRunnerTests : ServiceTest
    {
        private FakePresenter _presenter;
        private VulcanusDialogueRunner _runner;
        private readonly List<VulcanusDialogueAsset> _dialogues = new();

        [SetUp]
        public void SetUp()
        {
            _dialogues.Clear();
            _presenter = new FakePresenter();
        }

        private VulcanusDialogueRunner Runner()
        {
            Game.Use<IDialoguePresenter>(_presenter);
            Game.Catalog<DialogueCatalog>(_dialogues.ToArray<Object>());
            return _runner = Game.Get<VulcanusDialogueRunner>();
        }

        private VulcanusDialogueAsset Dialogue(string id, params VulcanusDialogueNode[] nodes)
        {
            var dialogue = Game.Asset<VulcanusDialogueAsset>();
            dialogue.Configure(null, 1, id, id, "", false, "", nodes[0].Id, Array.Empty<string>(), "", "", nodes,
                Array.Empty<VulcanusDialogueAsset.ImportedMessage>());
            _dialogues.Add(dialogue);
            return dialogue;
        }

        [Test]
        public void ALineWaitsForThePresenterThenTheFlowCompletes()
        {
            Dialogue("test:talk", new VulcanusDialogueLineNode("entry", "base:villager", "", "Hello", "", "end"),
                new VulcanusDialogueEndNode("end"));
            var completed = 0;

            Runner().StartDialogue("test:talk", onCompleted: () => completed++);

            Assert.That(_runner.IsDialogueActive, Is.True);
            Assert.That(_runner.CurrentDialogueId, Is.EqualTo("test:talk"));
            Assert.That(_runner.CurrentSpeakerId, Is.EqualTo("base:villager"));
            Assert.That(_presenter.Lines, Is.EqualTo(new[] { "Hello" }));
            Assert.That(completed, Is.Zero);

            _presenter.FinishLine();

            Assert.That(_runner.IsDialogueActive, Is.False);
            Assert.That(completed, Is.EqualTo(1));
            Assert.That(_presenter.Started, Is.EqualTo(1));
            Assert.That(_presenter.Finished, Is.EqualTo(1));
        }

        [Test]
        public void GameTimeStandsStillWhileADialogueRuns()
        {
            Dialogue("test:talk", new VulcanusDialogueLineNode("entry", "base:villager", "", "Hello", "", "end"),
                new VulcanusDialogueEndNode("end"));
            Runner();
            var clock = Game.Get<TimeAndWeather.GameClock>();

            _runner.StartDialogue("test:talk");
            Assert.That(clock.IsPaused, Is.True, "However the dialogue was started.");
            _presenter.FinishLine();
            Assert.That(clock.IsPaused, Is.False);

            _runner.StartDialogue("test:talk");
            _runner.StopDialogue();
            Assert.That(clock.IsPaused, Is.False, "Stopping a dialogue lets time run again too.");
        }

        [Test]
        public void ADialogueWithOnlyAnEndNodeFinishesBeforeStartReturns()
        {
            Dialogue("test:end", new VulcanusDialogueEndNode("entry"));
            var completed = false;

            Runner().StartDialogue("test:end", onCompleted: () => completed = true);

            Assert.That(completed, Is.True);
            Assert.That(_runner.IsDialogueActive, Is.False);
        }

        [Test]
        public void ChoicesOfferOnlyOptionsWhoseLuaConditionHolds()
        {
            Dialogue("test:choice",
                new VulcanusDialogueChoiceNode("entry", new[]
                {
                    new VulcanusDialogueChoiceOption("shown", "Shown", "", "1 == 1", "yes"),
                    new VulcanusDialogueChoiceOption("hidden", "Hidden", "", "1 == 2", "no")
                }),
                new VulcanusDialogueActionNode("yes", "GameState.Story.Set('test:answer', 'yes')", "end"),
                new VulcanusDialogueActionNode("no", "GameState.Story.Set('test:answer', 'no')", "end"),
                new VulcanusDialogueEndNode("end"));

            Runner().StartDialogue("test:choice");

            Assert.That(_presenter.OfferedOptions.Select(option => option.Id), Is.EqualTo(new[] { "shown" }));
            _presenter.Choose("shown");
            Assert.That(Game.State.Story.Get<string>("test:answer"), Is.EqualTo("yes"));
            Assert.That(_runner.IsDialogueActive, Is.False);
        }

        [Test]
        public void JumpsContinueInTheTargetDialogue()
        {
            Dialogue("test:first", new VulcanusDialogueJumpNode("entry", "test:second", "start"));
            Dialogue("test:second", new VulcanusDialogueLineNode("start", "", "", "Second", "", ""));

            Runner().StartDialogue("test:first");

            Assert.That(_runner.CurrentDialogueId, Is.EqualTo("test:second"));
            Assert.That(_presenter.Lines, Is.EqualTo(new[] { "Second" }));
        }

        [Test]
        public void ABrokenActionStopsTheFlowWithoutCompleting()
        {
            Dialogue("test:broken", new VulcanusDialogueActionNode("entry", "error('Broken fixture script')", "end"),
                new VulcanusDialogueEndNode("end"));
            var completed = false;
            LogAssert.Expect(LogType.Error, new Regex("Action failed in 'test:broken'"));
            LogAssert.Expect(LogType.Error, new Regex("Action node 'entry' failed"));

            Runner().StartDialogue("test:broken", onCompleted: () => completed = true);

            Assert.That(completed, Is.False);
            Assert.That(_runner.IsDialogueActive, Is.False);
            Assert.That(_presenter.Finished, Is.EqualTo(1));
        }

        [Test]
        public void ARunawayLoopStopsAtTheStepLimit()
        {
            Dialogue("test:loop", new VulcanusDialogueJumpNode("entry", "", "entry"));
            LogAssert.Expect(LogType.Error, new Regex("exceeded 256 steps"));

            Runner().StartDialogue("test:loop");

            Assert.That(_runner.IsDialogueActive, Is.False);
        }

        [Test]
        public void StoppingCancelsThePendingPresentationAndClosesThePresenterOnce()
        {
            Dialogue("test:talk", new VulcanusDialogueLineNode("entry", "", "", "Hello", "", ""));
            var completed = false;
            Runner().StartDialogue("test:talk", onCompleted: () => completed = true);

            _runner.StopDialogue();
            _runner.StopDialogue();

            Assert.That(_runner.IsDialogueActive, Is.False);
            Assert.That(_presenter.Cancelled, Is.True);
            Assert.That(_presenter.Finished, Is.EqualTo(1));
            Assert.That(completed, Is.False);
        }

        [Test]
        public void AStoppedFlowThatResumesLaterCannotCloseOrCompleteTheNextDialogue()
        {
            Dialogue("test:talk", new VulcanusDialogueLineNode("entry", "", "", "Hello", "", ""));
            var firstCompleted = false;
            _presenter.IgnoreCancellation = true; // A presenter may finish its work after the runner has moved on.
            Runner().StartDialogue("test:talk", onCompleted: () => firstCompleted = true);
            var staleLine = _presenter.PendingLine;
            _runner.StopDialogue();

            _presenter.IgnoreCancellation = false;
            _runner.StartDialogue("test:talk");
            staleLine.SetResult();

            Assert.That(firstCompleted, Is.False);
            Assert.That(_runner.IsDialogueActive, Is.True, "The newer dialogue must keep running.");
            Assert.That(_presenter.Finished, Is.EqualTo(1));
        }

        [Test]
        public void TheScreenBeingDismissedEndsTheDialogue()
        {
            Dialogue("test:talk", new VulcanusDialogueLineNode("entry", "", "", "Hello", "", ""));
            Runner().StartDialogue("test:talk");

            _presenter.Dismiss();

            Assert.That(_runner.IsDialogueActive, Is.False);
            Assert.That(_presenter.Finished, Is.EqualTo(1));
        }

        [Test]
        public void StartingRequiresAKnownDialogueAndNoRunningOne()
        {
            Dialogue("test:talk", new VulcanusDialogueLineNode("entry", "", "", "Hello", "", ""));
            Runner();

            Assert.That(() => _runner.StartDialogue("test:missing"), Throws.InvalidOperationException);
            _runner.StartDialogue("test:talk");
            Assert.That(() => _runner.StartDialogue("test:talk"), Throws.InvalidOperationException);
        }

        [Test]
        public void DisposingStopsTheDialogueAndStopsListeningToThePresenter()
        {
            Dialogue("test:talk", new VulcanusDialogueLineNode("entry", "", "", "Hello", "", ""));
            Runner().StartDialogue("test:talk");

            _runner.Dispose();

            Assert.That(_runner.IsDialogueActive, Is.False);
            Assert.That(_presenter.HasDismissListeners, Is.False);
        }

        [Test]
        public void DialogueValidationRejectsUnknownReferencesBeforeOpeningThePresenter()
        {
            Dialogue("test:talk", new VulcanusDialogueLineNode("entry", "", "", "Hello", "", ""));
            Runner();
            Assert.That(() => _runner.ValidateDialogue("test:talk"), Throws.Nothing);
            Assert.That(() => _runner.ValidateDialogue("test:missing"), Throws.InvalidOperationException);
            Assert.That(_presenter.Started, Is.Zero);
        }

        [Test]
        public void FabiasTopicMenuCanBeRevisitedBeyondTheExecutionLimit()
        {
            // Use the shipped conversation, including its line-to-choice loops, rather than a synthetic cycle.
            _dialogues.Add(UnityEditor.AssetDatabase.LoadAssetAtPath<VulcanusDialogueAsset>(
                "Assets/Vulcan/0204project/dialogues/fabia_greeting.runtime.dialogue.json"));
            Runner().StartDialogue("base:fabia_greeting");
            _presenter.FinishLine();
            for (var visit = 0; visit < 50; visit++)
            {
                _presenter.Choose("opt-chat");
                for (var line = 0; line < 5; line++) _presenter.FinishLine();
            }
            Assert.That(_runner.ActiveContext.StepsExecuted, Is.GreaterThan(256));
            Assert.That(_runner.IsDialogueActive, Is.True);
            _presenter.Choose("opt-bye");
            _presenter.FinishLine();
            Assert.That(_runner.IsDialogueActive, Is.False);
            Assert.That(_presenter.Finished, Is.EqualTo(1));
        }

        /// <summary>Records what the runner asks for and lets the test decide when the player is done.</summary>
        private sealed class FakePresenter : IDialoguePresenter
        {
            private AwaitableCompletionSource _line;
            private AwaitableCompletionSource<VulcanusDialogueChoiceOption> _choice;
            public readonly List<string> Lines = new();
            public IReadOnlyList<VulcanusDialogueChoiceOption> OfferedOptions = Array.Empty<VulcanusDialogueChoiceOption>();
            public int Started, Finished;
            public bool Cancelled, IgnoreCancellation;
            public AwaitableCompletionSource PendingLine => _line;
            public bool HasDismissListeners => Dismissed != null;
            public event Action Dismissed;

            public void OnDialogueStarted(VulcanusDialogueExecutionContext context) => Started++;
            public void OnDialogueFinished(VulcanusDialogueExecutionContext context) => Finished++;
            public void Dismiss() => Dismissed?.Invoke();
            public void FinishLine() => _line.SetResult();
            public void Choose(string id) => _choice.SetResult(OfferedOptions.Single(option => option.Id == id));

            public async Awaitable PresentLine(VulcanusDialogueLineNode node, string localizedText,
                VulcanusDialogueExecutionContext context, CancellationToken cancellation)
            {
                Lines.Add(localizedText);
                var line = _line = new AwaitableCompletionSource();
                if (!IgnoreCancellation) cancellation.Register(() => { Cancelled = true; line.TrySetCanceled(); });
                await line.Awaitable;
            }

            public async Awaitable<VulcanusDialogueChoiceOption> PresentChoice(VulcanusDialogueChoiceNode node,
                IReadOnlyList<VulcanusDialogueChoiceOption> options, VulcanusDialogueExecutionContext context,
                CancellationToken cancellation)
            {
                OfferedOptions = options;
                var choice = _choice = new AwaitableCompletionSource<VulcanusDialogueChoiceOption>();
                cancellation.Register(() => { Cancelled = true; choice.TrySetCanceled(); });
                return await choice.Awaitable;
            }
        }
    }
}

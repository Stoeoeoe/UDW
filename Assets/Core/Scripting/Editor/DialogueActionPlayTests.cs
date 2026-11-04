using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using Character;
using Core.Common.Editor;
using Core.Context;
using Core.Dialogue.Vulcanus;
using Core.Game;
using Core.Location;
using Core.Music;
using Core.Spawning;
using Core.Tile;
using Core.Tile.Vulcanus;
using DG.Tweening;
using Input;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UI.Shared;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;
using Object = UnityEngine.Object;
using static Core.Common.Editor.Reflect;

namespace Core.Scripting.Editor
{
    [Explicit("Uses the playable map and real dialogue UI across Unity frames.")]
    public sealed class DialogueActionPlayTests
    {
        private GameObject _root;
        private VulcanusDialogueRunner _runner;
        private UIDocument _document;
        private DialogueCatalog _catalog;
        private Object[] _authoredDialogues;
        private VulcanusDialogueAsset _talk, _end, _error;
        private CutsceneDefinition _npcMovement;
        private CutsceneDefinition NpcMovement => _npcMovement ??= CreateNpcMovementDefinition();

        [UnitySetUp]
        public IEnumerator SetUp()
        {
            if (SceneManager.GetActiveScene().path != "Assets/Scenes/Maps/map-1.unity")
                EditorSceneManager.OpenScene("Assets/Scenes/Maps/map-1.unity", OpenSceneMode.Single);
            yield return new EnterPlayMode();
            var deadline = Time.realtimeSinceStartup + 15f;
            while (!LiveGame.Get<LevelManager>() || !LiveGame.Get<LevelManager>().SceneReady)
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), "The map must finish initialization.");
                yield return null;
            }
            BindLiveScene();
        }

        private void BindLiveScene()
        {
            Assert.That(LiveGame.Get<VulcanusDialogueRunner>(), Is.Not.Null, "The Systems prefab must provide the shared dialogue UI.");
            _talk = CreateDialogue("fixture:talk",
                new VulcanusDialogueLineNode("entry", "", "", "Hello", "", "choice"),
                new VulcanusDialogueChoiceNode("choice", new[] { new VulcanusDialogueChoiceOption("bye", "Goodbye", "", "", "answer") }),
                new VulcanusDialogueActionNode("answer", "GameState.Story.Set('fixture:dialogue-choice', true)", "end"),
                new VulcanusDialogueEndNode("end"));
            _end = CreateDialogue("fixture:end", new VulcanusDialogueEndNode("entry"));
            _error = CreateDialogue("fixture:error", new VulcanusDialogueActionNode("entry", "error('Broken fixture script')", ""));
            // The fixture dialogues join the live catalog for this run and are removed again in TearDown.
            _catalog = LiveGame.Get<DialogueCatalog>();
            _authoredDialogues = _catalog.Entries.Select(entry => entry.Definition).ToArray();
            _catalog.Synchronize(_authoredDialogues.Concat(new[] { _talk, _end, _error }));

            _runner = LiveGame.Get<VulcanusDialogueRunner>();
            var presenter = (VulcanusDialogueUIDocumentPresenter)LiveGame.Get<IDialoguePresenter>();
            _root = presenter.gameObject;
            _document = presenter.GetComponent<UIDocument>();
            Set(presenter, "charactersPerSecond", 0f);
        }

        [UnityTest]
        public IEnumerator LuaWaitsForLineAndGoodbyeChoiceThenContinues()
        {
            var api = new DialogueLuaApi(_runner, LiveGame.Player);
            Assert.That(() => api.ValidatePlay("missing"), Throws.InvalidOperationException);
            using var run = Start(api, "Dialogue.Play('fixture:talk'); Dialogue.Play('fixture:end')");
            run.Tick(0);
            for (var frame = 0; frame < 3; frame++) { yield return null; run.Tick(Time.unscaledDeltaTime); }
            Assert.That(run.IsRunning, Is.True);
            Assert.That(_runner.ActiveContext.CurrentNode, Is.TypeOf<VulcanusDialogueLineNode>());
            Assert.That(_runner.TryAdvanceActiveDialogue(), Is.True);
            for (var frame = 0; frame < 10 && _runner.ActiveContext.CurrentNode is not VulcanusDialogueChoiceNode; frame++)
                yield return null;
            Assert.That(_runner.ActiveContext.CurrentNode, Is.TypeOf<VulcanusDialogueChoiceNode>());
            run.Tick(0);
            Assert.That(run.IsRunning, Is.True);
            using (var key = KeyDownEvent.GetPooled('\0', KeyCode.Alpha1, EventModifiers.None))
            {
                key.target = _document.rootVisualElement.Q("dialogue-overlay");
                ((VisualElement)key.target).SendEvent(key);
            }
            for (var frame = 0; frame < 10 && run.IsRunning; frame++)
            { yield return null; run.Tick(Time.unscaledDeltaTime); }
            Assert.That(run.IsRunning, Is.False);
            AssertClosed();
        }

        [UnityTest]
        public IEnumerator CutsceneOwnsInputClockAndSavesUntilTerminalCommit()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            Assert.That(service, Is.Not.Null, "The authored Systems prefab must include the cutscene runner.");
            var definition = CreateCutscene("fixture:terminal", true, "fixture_intro_done", "fixture:end");
            try
            {
                Assert.That(service.TryStart(definition, out var run), Is.True);
                Assert.That(service.TryStart(definition, out _), Is.False, "A busy start cannot replace or queue the active run.");
                Assert.That(LiveGame.Get<UrGUIManager>().IsGameClockPaused, Is.True);
                Assert.That(LiveGame.Get<PlayerInteractionContext>().CurrentSnapshot.WorldInteractionBlocked, Is.True);
                Assert.That(LiveGame.Get<InputManager>().PlayerControls.enabled, Is.False);
                Assert.That(LiveGame.Get<InputManager>().Actions.FindActionMap("Global").enabled, Is.False);
                Assert.That(LiveGame.Get<InputManager>().Actions.FindActionMap("UI").enabled, Is.True);
                Assert.That(Time.timeScale, Is.EqualTo(1f), "Calendar pause must not freeze physics.");
                Assert.That(() => LiveGame.Get<GameStateManager>().Save("cutscene_staging_rejected"), Throws.InvalidOperationException);
                var deadline = Time.realtimeSinceStartup + 5;
                while (service.IsRunning && Time.realtimeSinceStartup < deadline) yield return null;
                Assert.That(run.IsRunning, Is.False);
                Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains("fixture:terminal"), Is.True);
                Assert.That(LiveGame.Get<GameState>().Story.Has("fixture_intro_done"), Is.True);
                Assert.That(service.TryStart(definition, out _), Is.False, "Completion is tracked by the cutscene ID.");
                Assert.That(LiveGame.Player.IsControlBlocked, Is.False);
                Assert.That(LiveGame.Get<InputManager>().PlayerControls.enabled, Is.True);
                AssertClosed();
                var slot = "cutscene_test_" + Guid.NewGuid().ToString("N");
                try
                {
                    LiveGame.Get<GameStateManager>().Save(slot);
                    Assert.That(LiveGame.Get<GameSaveService>().TryLoad(slot, out var saved), Is.True);
                    Assert.That(saved.story.CompletedCutscenes.Contains("fixture:terminal"), Is.True);
                }
                finally { File.Delete(GameSaveService.GetSavePath(slot)); }
            }
            finally { service.Cancel(); Object.Destroy(definition); }
        }

        [UnityTest]
        public IEnumerator CutsceneCancellationAndSkipSettleBeforeCallbacksAndIgnoreOldHandles()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            Assert.That(service, Is.Not.Null);
            var cancelled = CreateCutscene("fixture:cancel", true, "fixture_cancelled", "fixture:talk");
            var skipped = CreateCutscene("fixture:skip", true, "fixture_skipped", "fixture:talk");
            try
            {
                Assert.That(service.TryStart(cancelled, out var old), Is.True);
                yield return null;
                Assert.That(_runner.IsDialogueActive, Is.True);
                old.Cancel(); old.Dispose();
                Assert.That(old.IsRunning, Is.False);
                Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains("fixture:cancel"), Is.False);
                Assert.That(LiveGame.Get<GameState>().Story.Has("fixture_cancelled"), Is.False);
                AssertClosed();
                Assert.That(service.TryStart(skipped, out var run), Is.True);
                old.Cancel();
                Assert.That(service.ActiveRun, Is.SameAs(run));
                yield return null;
                var finished = 0;
                Action<CutsceneRun> observer = terminal =>
                {
                    finished++;
                    Assert.That(service.IsRunning, Is.False);
                    Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains("fixture:skip"), Is.True);
                    Assert.That(LiveGame.Get<GameState>().Story.Has("fixture_skipped"), Is.True);
                    Assert.That(LiveGame.Get<UrGUIManager>().IsGameClockPaused, Is.False);
                    terminal.Cancel();
                };
                service.Finished += observer;
                try
                {
                    Assert.That(run.Skip(), Is.True);
                    Assert.That(run.Skip(), Is.False);
                    Assert.That(finished, Is.EqualTo(1));
                }
                finally { service.Finished -= observer; }
                Assert.That(run.Skipped, Is.True);
                AssertClosed();
            }
            finally { service.Cancel(); Object.Destroy(cancelled); Object.Destroy(skipped); }
        }

        [UnityTest]
        public IEnumerator PlayerSkipRequiresConfirmationAndCancelKeepsTheCutsceneRunning()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var prompt = Object.FindFirstObjectByType<CutsceneSkipConfirmation>();
            var definition = CreateCutscene("fixture:confirmed-skip", true, "fixture_confirmed_skip", "fixture:talk");
            var document = prompt.GetComponent<UIDocument>();
            try
            {
                Assert.That(service.TryStart(definition, out var run), Is.True);
                yield return null;
                Assert.That(RequestSkip(service), Is.True);
                Assert.That(prompt.IsOpen, Is.True);
                Assert.That(Time.timeScale, Is.Zero);
                Assert.That(run.Skipped, Is.False);
                var keep = document.rootVisualElement.Q<Button>("keepWatching");
                Assert.That(document.rootVisualElement.panel.focusController.focusedElement, Is.SameAs(keep));
                Submit(document.rootVisualElement.Q<Button>("confirmSkip"));
                Assert.That(run.Skipped, Is.False, "The opening frame cannot also accept the confirmation.");
                yield return new WaitForSecondsRealtime(0.2f);
                Assert.That(run.Skipped, Is.False);
                Assert.That(Time.timeScale, Is.Zero);
                var overlay = document.rootVisualElement.Q("skipConfirmation");
                Assert.That(overlay.worldBound.width, Is.EqualTo(overlay.panel.visualTree.worldBound.width).Within(1));
                Assert.That(overlay.worldBound.height, Is.EqualTo(overlay.panel.visualTree.worldBound.height).Within(1));
                using (var cancel = NavigationCancelEvent.GetPooled())
                    document.rootVisualElement.Q("skipConfirmation").SendEvent(cancel);
                Assert.That(prompt.IsOpen, Is.False);
                Assert.That(run.IsRunning, Is.True);
                Assert.That(Time.timeScale, Is.EqualTo(1f));
                Assert.That(RequestSkip(service), Is.False, "Cancel must not reopen the prompt in the same frame.");
                yield return null;
                Assert.That(RequestSkip(service), Is.True);
                yield return null;
                Submit(keep);
                var deadline = Time.realtimeSinceStartup + 1;
                while (prompt.IsOpen && Time.realtimeSinceStartup < deadline) yield return null;
                Assert.That(prompt.IsOpen, Is.False);
                Assert.That(run.Skipped, Is.False);
                yield return null;
                Assert.That(RequestSkip(service), Is.True);
                yield return null;
                Submit(document.rootVisualElement.Q<Button>("confirmSkip"));
                deadline = Time.realtimeSinceStartup + 1;
                while (run.IsRunning && Time.realtimeSinceStartup < deadline) yield return null;
                Assert.That(run.Skipped, Is.True);
                Assert.That(run.IsRunning, Is.False);
                Assert.That(prompt.IsOpen, Is.False);
                Assert.That(LiveGame.Get<GameState>().Story.Has("fixture_confirmed_skip"), Is.True);
            }
            finally { service.Cancel(); Object.Destroy(definition); }
        }

        [UnityTest]
        public IEnumerator SkipPromptRespectsUnskippableRunsAndClosesOnCancellation()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var prompt = Object.FindFirstObjectByType<CutsceneSkipConfirmation>();
            var locked = CreateCutscene("fixture:locked-skip", false, "fixture_locked_skip", "fixture:talk");
            var skippable = CreateCutscene("fixture:cancel-prompt", true, "fixture_cancel_prompt", "fixture:talk");
            try
            {
                Assert.That(service.TryStart(locked, out var first), Is.True);
                Assert.That(RequestSkip(service), Is.False);
                Assert.That(prompt.IsOpen, Is.False);
                first.Cancel();
                yield return null;
                Assert.That(service.TryStart(skippable, out var second), Is.True);
                Assert.That(RequestSkip(service), Is.True);
                second.Cancel();
                Assert.That(prompt.IsOpen, Is.False);
                Assert.That(second.Skipped, Is.False);
                Assert.That(Time.timeScale, Is.EqualTo(1f));
                Assert.That(LiveGame.Get<GameState>().Story.Has("fixture_cancel_prompt"), Is.False);
            }
            finally { service.Cancel(); Object.Destroy(locked); Object.Destroy(skippable); }
        }

        [UnityTest]
        public IEnumerator SkipPromptFreezesTimedPlaybackUntilDismissed()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var prompt = Object.FindFirstObjectByType<CutsceneSkipConfirmation>();
            var sequence = JArray.Parse("[{ 'id':'wait', 'action':'cutscene.wait', 'arguments':{ 'seconds':0.2 } }, { 'id':'talk', 'action':'dialogue.play', 'arguments':{ 'dialogue':'fixture:end' } }]");
            var lua = CutsceneSequenceCompiler.Compile(sequence, "fixture:paused-skip", out var steps);
            var definition = ScriptableObject.CreateInstance<CutsceneDefinition>();
            definition.Configure("fixture:paused-skip", LiveGame.Get<MapManager>().CurrentMap.MapId, lua, steps, true,
                new CutsceneCompletion(Array.Empty<CutsceneCharacterPlacement>(), "GameState.Story.Set('fixture_paused_skip', true)", "", Array.Empty<CutsceneStep>()),
                "", Array.Empty<CutsceneStep>(), new CutsceneTransition(enabled: false));
            try
            {
                Assert.That(service.TryStart(definition, out var run), Is.True);
                yield return null;
                Assert.That(RequestSkip(service), Is.True);
                var step = service.CurrentStepId;
                yield return new WaitForSecondsRealtime(0.5f);
                Assert.That(Time.timeScale, Is.Zero);
                Assert.That(run.IsRunning, Is.True);
                Assert.That(service.CurrentStepId, Is.EqualTo(step));
                Assert.That(LiveGame.Get<GameState>().Story.Has("fixture_paused_skip"), Is.False);
                using (var cancel = NavigationCancelEvent.GetPooled())
                    prompt.GetComponent<UIDocument>().rootVisualElement.Q("skipConfirmation").SendEvent(cancel);
                Assert.That(Time.timeScale, Is.EqualTo(1f));
                var deadline = Time.realtimeSinceStartup + 3;
                while (run.IsRunning && Time.realtimeSinceStartup < deadline) yield return null;
                Assert.That(run.IsRunning, Is.False);
                Assert.That(run.Skipped, Is.False);
                Assert.That(LiveGame.Get<GameState>().Story.Has("fixture_paused_skip"), Is.True);
            }
            finally { service.Cancel(); Object.Destroy(definition); }
        }

        [UnityTest]
        public IEnumerator ConfirmedSkipKeepsTimeFrozenUntilExitReveal()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var prompt = Object.FindFirstObjectByType<CutsceneSkipConfirmation>();
            var sequence = JArray.Parse("[{ 'id':'wait', 'action':'cutscene.wait', 'arguments':{ 'seconds':60 } }]");
            var lua = CutsceneSequenceCompiler.Compile(sequence, "fixture:skip-exit-pause", out var steps);
            var definition = ScriptableObject.CreateInstance<CutsceneDefinition>();
            definition.Configure("fixture:skip-exit-pause", LiveGame.Get<MapManager>().CurrentMap.MapId, lua, steps, true,
                new CutsceneCompletion(Array.Empty<CutsceneCharacterPlacement>(), "GameState.Story.Set('fixture_skip_exit_pause', true)", "", Array.Empty<CutsceneStep>()),
                "", Array.Empty<CutsceneStep>(), new CutsceneTransition());
            try
            {
                Assert.That(service.TryStart(definition, out var run), Is.True);
                var transition = typeof(CutsceneRunner).GetField("_transition", BindingFlags.Instance | BindingFlags.NonPublic);
                var deadline = Time.realtimeSinceStartup + 10;
                while (transition.GetValue(service) != null && Time.realtimeSinceStartup < deadline) yield return null;
                Assert.That(transition.GetValue(service), Is.Null, "The entrance reveal must finish.");
                Assert.That(RequestSkip(service), Is.True);
                yield return null;
                Submit(prompt.GetComponent<UIDocument>().rootVisualElement.Q<Button>("confirmSkip"));
                deadline = Time.realtimeSinceStartup + 10;
                while (!LiveGame.Get<GameState>().Story.Has("fixture_skip_exit_pause") && Time.realtimeSinceStartup < deadline)
                {
                    Assert.That(Time.timeScale, Is.Zero, "Confirmation must never release time during exit cover.");
                    yield return null;
                }
                Assert.That(run.Skipped, Is.True);
                Assert.That(prompt.IsOpen, Is.False);
                Assert.That(LiveGame.Get<GameState>().Story.Has("fixture_skip_exit_pause"), Is.True);
                Assert.That(run.IsRunning, Is.True, "Completion commits before the exit reveal releases control.");
                Assert.That(Time.timeScale, Is.EqualTo(1f));
            }
            finally { service.Cancel(); Object.Destroy(definition); }
        }

        private static bool RequestSkip(CutsceneRunner service) => (bool)Call(service, "RequestSkip");

        private static void Submit(Button button)
        {
            using var submit = NavigationSubmitEvent.GetPooled();
            submit.target = button;
            button.SendEvent(submit);
        }

        private static CutsceneDefinition CreateCutscene(string id, bool skip, string completionFlag, string dialogue,
            params CutsceneStep[] beforeDialogue)
        {
            var steps = beforeDialogue.Append(Step("talk", "dialogue.play", ("dialogue", dialogue))).ToArray();
            var sequence = new JArray(steps.Select(step => new JObject { ["id"] = step.Id, ["action"] = step.ActionId,
                ["arguments"] = new JObject(step.Arguments.Select(argument => new JProperty(argument.Name, argument.Value))) }));
            var compiled = CutsceneSequenceCompiler.Compile(sequence, id, out var importedSteps);
            var definition = ScriptableObject.CreateInstance<CutsceneDefinition>();
            definition.Configure(id, LiveGame.Get<MapManager>().CurrentMap.MapId, compiled, importedSteps, skip,
                new CutsceneCompletion(Array.Empty<CutsceneCharacterPlacement>(), $"GameState.Story.Set('{completionFlag}', true)", "", Array.Empty<CutsceneStep>()),
                "", Array.Empty<CutsceneStep>(), new CutsceneTransition(enabled: false));
            return definition;
        }

        [UnityTest]
        public IEnumerator StructuredPhasesRunBeforeStartedAndOnCompletionOrSkipButRestoreOnCancel()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var character = LiveGame.Player;
            var started = 0;
            Action<CutsceneRun> observer = run =>
            {
                if (!run.Definition.CutsceneId.StartsWith("fixture:phases-", StringComparison.Ordinal)) return;
                started++;
                Assert.That(character.Orientation.FacingDirection, Is.EqualTo(Vector2.right));
                Assert.That(character.IsControlBlocked, Is.True);
            };
            service.Started += observer;
            try
            {
                foreach (var terminal in new[] { "cancel", "skip", "complete" })
                {
                    character.Orientation.ForceDirection(Vector2.up);
                    var id = "fixture:phases-" + terminal;
                    var definition = CreatePhaseDefinition(id, terminal == "complete" ? 0 : 60);
                    try
                    {
                        Assert.That(service.TryStart(definition, out var run), Is.True);
                        Assert.That(character.Orientation.FacingDirection, Is.EqualTo(Vector2.right));
                        if (terminal == "cancel") run.Cancel();
                        else if (terminal == "skip") Assert.That(run.Skip(), Is.True);
                        else
                        {
                            for (var frame = 0; frame < 30 && run.IsRunning; frame++) yield return null;
                            Assert.That(run.IsRunning, Is.False);
                        }
                        Assert.That(character.Orientation.FacingDirection, Is.EqualTo(terminal == "cancel" ? Vector2.up : Vector2.left));
                        Assert.That(LiveGame.Get<GameState>().Story.Has(id), Is.EqualTo(terminal != "cancel"));
                        Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains(id), Is.EqualTo(terminal != "cancel"));
                        Assert.That(character.IsControlBlocked, Is.False);
                        Assert.That(LiveGame.Get<UrGUIManager>().IsGameClockPaused, Is.False);
                    }
                    finally { service.Cancel(); Object.Destroy(definition); }
                }
                Assert.That(started, Is.EqualTo(3));
            }
            finally { service.Started -= observer; }
        }

        [UnityTest]
        public IEnumerator SetupFailureRestoresStagingAndBadCompletionReferencesFailBeforeSetup()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var character = LiveGame.Player;
            character.Orientation.ForceDirection(Vector2.up);
            var failed = CreatePhaseDefinition("fixture:setup-failure", 60);
            var invalid = CreatePhaseDefinition("fixture:invalid-completion", 60, "missing-character");
            var notifications = 0;
            Action<CutsceneRun> count = _ => notifications++;
            Action<Vector2> fail = facing => { if (facing == Vector2.right) throw new InvalidOperationException("Fixture setup failure."); };
            service.Started += count;
            service.Finished += count;
            character.Orientation.OnFacingDirectionChanged += fail;
            try
            {
                Assert.That(() => service.TryStart(failed, out _), Throws.InvalidOperationException
                    .With.Message.Contains("setup").And.Message.Contains("stage").And.Message.Contains("Fixture setup failure"));
                Assert.That(character.Orientation.FacingDirection, Is.EqualTo(Vector2.up));
                Assert.That(character.IsControlBlocked, Is.False);
                Assert.That(service.IsRunning, Is.False);
                Assert.That(LiveGame.Get<UrGUIManager>().IsGameClockPaused, Is.False);
                Assert.That(notifications, Is.Zero);
                Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains(failed.CutsceneId), Is.False);
                Assert.That(() => service.TryStart(invalid, out _), Throws.InvalidOperationException
                    .With.Message.Contains("completion").And.Message.Contains("finish").And.Message.Contains("missing-character"));
                Assert.That(character.Orientation.FacingDirection, Is.EqualTo(Vector2.up));
                Assert.That(character.IsControlBlocked, Is.False);
                Assert.That(notifications, Is.Zero);
            }
            finally
            {
                character.Orientation.OnFacingDirectionChanged -= fail;
                service.Started -= count;
                service.Finished -= count;
                service.Cancel();
                Object.Destroy(failed);
                Object.Destroy(invalid);
            }
            yield return null;
        }

        [UnityTest]
        public IEnumerator TransitionsCoverSetupAndCompletionAndHoldInputThroughExit()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var player = LiveGame.Player;
            foreach (var terminal in new[] { "complete", "skip", "cancel" })
            {
                var id = "fixture:transition-" + terminal;
                var definition = CreatePhaseDefinition(id, terminal == "complete" ? 0.01 : 60);
                definition.Configure(id, definition.MapId, definition.Lua, definition.Steps, true,
                    definition.OnComplete, definition.OnStartLua, definition.OnStart, new CutsceneTransition());
                try
                {
                    var originalFacing = player.Orientation.FacingDirection;
                    Assert.That(service.TryStart(definition, out var run), Is.True);
                    Assert.That(player.IsControlBlocked, Is.True);
                    Assert.That(LiveGame.Get<InputManager>().PlayerControls.enabled, Is.False);
                    Assert.That(player.Orientation.FacingDirection, Is.EqualTo(originalFacing), "Setup must wait for the entrance to reach black.");
                    Assert.That(service.CurrentStepId, Is.Null, "The sequence must wait for the entrance cover.");
                    if (terminal == "cancel")
                    {
                        run.Cancel();
                        Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains(id), Is.False);
                    }
                    else
                    {
                        if (terminal == "skip") Assert.That(run.Skip(), Is.True);
                        var sawCompletedWhileCovered = false;
                        var deadline = Time.realtimeSinceStartup + 10f;
                        while (run.IsRunning && Time.realtimeSinceStartup < deadline)
                        {
                            Assert.That(player.IsControlBlocked, Is.True);
                            Assert.That(LiveGame.Get<InputManager>().PlayerControls.enabled, Is.False);
                            if (LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains(id)) sawCompletedWhileCovered = true;
                            yield return null;
                        }
                        Assert.That(sawCompletedWhileCovered, Is.True, "Completion applies before the exit reveal releases input.");
                        Assert.That(LiveGame.Get<GameState>().Story.Has(id), Is.True);
                    }
                    Assert.That(run.IsRunning, Is.False);
                    Assert.That(player.IsControlBlocked, Is.False);
                    Assert.That(LiveGame.Get<InputManager>().PlayerControls.enabled, Is.True);
                }
                finally { service.Cancel(); Object.Destroy(definition); }
            }
        }

        [UnityTest]
        public IEnumerator SetupAndStartedWaitUntilTheEntranceHasFadedToBlack()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var definition = CreatePresentedPhaseDefinition("fixture:entrance-timing");
            var player = LiveGame.Player;
            var originalFacing = player.Orientation.FacingDirection;
            var started = false;
            var group = Object.FindFirstObjectByType<ScreenFader>().GetComponent<CanvasGroup>();
            Action<CutsceneRun> onStarted = _ =>
            {
                Assert.That(group.alpha, Is.EqualTo(1));
                Assert.That(player.Orientation.FacingDirection, Is.EqualTo(Vector2.right));
                started = true;
            };
            service.Started += onStarted;
            try
            {
                Assert.That(service.TryStart(definition, out _), Is.True);
                var cover = CurrentTransition(service);
                cover.SetUpdate(UpdateType.Manual);
                cover.Goto(0.15f);
                Assert.That(group.alpha, Is.EqualTo(0.5f).Within(0.01));
                Assert.That(started, Is.False);
                Assert.That(player.Orientation.FacingDirection, Is.EqualTo(originalFacing));
                cover.Goto(1f);
                yield return null;
                Assert.That(group.alpha, Is.EqualTo(1));
                Assert.That(started, Is.False, "Setup waits for the hold on black.");
                cover.Complete();
                var deadline = Time.realtimeSinceStartup + 5f;
                while (!started && Time.realtimeSinceStartup < deadline) yield return null;
                Assert.That(started, Is.True);
                Assert.That(CurrentTransition(service), Is.Not.SameAs(cover));
            }
            finally { service.Started -= onStarted; service.Cancel(); Object.Destroy(definition); }
        }

        [UnityTest]
        public IEnumerator SkipFadesToBlackBeforeDisposingTheActiveActionAndApplyingCompletion()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var definition = CreatePresentedPhaseDefinition("fixture:skip-cover-timing");
            var player = LiveGame.Player;
            var group = Object.FindFirstObjectByType<ScreenFader>().GetComponent<CanvasGroup>();
            try
            {
                Assert.That(service.TryStart(definition, out var run), Is.True);
                var session = (LuaExecutionSession)typeof(CutsceneRun).GetProperty("Session",
                    BindingFlags.Instance | BindingFlags.NonPublic).GetValue(run);
                CurrentTransition(service).Complete();
                var deadline = Time.realtimeSinceStartup + 5f;
                while (service.CurrentStepId == null && Time.realtimeSinceStartup < deadline) yield return null;
                Assert.That(service.CurrentStepId, Is.EqualTo("wait"));
                var reveal = CurrentTransition(service);
                reveal.SetUpdate(UpdateType.Manual);
                Assert.That(run.Skip(), Is.True);
                Assert.That(Time.timeScale, Is.Zero);
                yield return null;
                Assert.That(CurrentTransition(service), Is.SameAs(reveal), "Skip finishes the entrance reveal first.");
                reveal.Complete();
                while (ReferenceEquals(CurrentTransition(service), reveal) && Time.realtimeSinceStartup < deadline) yield return null;
                var cover = CurrentTransition(service);
                Assert.That(cover, Is.Not.Null);
                cover.SetUpdate(UpdateType.Manual);
                cover.Goto(1f);
                yield return null;
                Assert.That(group.alpha, Is.EqualTo(1));
                Assert.That(session.IsRunning, Is.True, "The skipped action remains owned through the exit hold.");
                Assert.That(LiveGame.Get<GameState>().Story.Has(definition.CutsceneId), Is.False);
                cover.Complete();
                while (!LiveGame.Get<GameState>().Story.Has(definition.CutsceneId) && Time.realtimeSinceStartup < deadline) yield return null;
                Assert.That(LiveGame.Get<GameState>().Story.Has(definition.CutsceneId), Is.True);
                Assert.That(session.IsRunning, Is.False);
                Assert.That(player.Orientation.FacingDirection, Is.EqualTo(Vector2.left));
                Assert.That(run.IsRunning, Is.True, "Input stays claimed through the exit reveal.");
                Assert.That(Time.timeScale, Is.EqualTo(1f));
            }
            finally { service.Cancel(); Object.Destroy(definition); }
        }

        private static Tween CurrentTransition(CutsceneRunner service) => (Tween)typeof(CutsceneRunner)
            .GetField("_transition", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(service);

        private static CutsceneDefinition CreatePresentedPhaseDefinition(string id)
        {
            var definition = CreatePhaseDefinition(id, 60);
            definition.Configure(id, definition.MapId, definition.Lua, definition.Steps, true,
                definition.OnComplete, definition.OnStartLua, definition.OnStart, new CutsceneTransition());
            return definition;
        }

        [UnityTest]
        public IEnumerator CancellingPresentationSettlesImmediatelyAndCannotAdvanceAReplacementRun()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var player = LiveGame.Player;
            var transition = typeof(CutsceneRunner).GetField("_transition", BindingFlags.Instance | BindingFlags.NonPublic);
            foreach (var stage in new[] { "entrance", "started-listener", "entrance-reveal", "sequence", "exit-cover", "exit-reveal" })
            {
                var id = "fixture:cancel-presentation-" + stage;
                var definition = CreatePhaseDefinition(id, 60);
                definition.Configure(id, definition.MapId, definition.Lua, definition.Steps, true,
                    definition.OnComplete, definition.OnStartLua, definition.OnStart, new CutsceneTransition());
                var replacement = CreatePhaseDefinition(id + "-replacement", 60);
                replacement.Configure(replacement.CutsceneId, replacement.MapId, replacement.Lua, replacement.Steps, true,
                    replacement.OnComplete, replacement.OnStartLua, replacement.OnStart, new CutsceneTransition());
                var originalFacing = player.Orientation.FacingDirection;
                var started = false;
                Action<CutsceneRun> onStarted = run =>
                {
                    started = true;
                    if (stage == "started-listener") run.Cancel();
                };
                service.Started += onStarted;
                try
                {
                    Assert.That(service.TryStart(definition, out var old), Is.True);
                    var deadline = Time.realtimeSinceStartup + 10f;
                    if (stage != "entrance")
                    {
                        while (!started && Time.realtimeSinceStartup < deadline) yield return null;
                        Assert.That(started, Is.True);
                    }
                    if (stage is "sequence" or "exit-cover" or "exit-reveal")
                    {
                        while (transition.GetValue(service) != null && Time.realtimeSinceStartup < deadline) yield return null;
                        Assert.That(transition.GetValue(service), Is.Null);
                    }
                    if (stage is "exit-cover" or "exit-reveal")
                    {
                        Assert.That(old.Skip(), Is.True);
                        while (transition.GetValue(service) == null && Time.realtimeSinceStartup < deadline) yield return null;
                        Assert.That(transition.GetValue(service), Is.Not.Null);
                    }
                    if (stage == "exit-reveal")
                    {
                        while (!LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains(id) && Time.realtimeSinceStartup < deadline) yield return null;
                        Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains(id), Is.True);
                    }

                    old.Cancel();
                    Assert.That(old.IsRunning, Is.False);
                    Assert.That(service.IsRunning, Is.False);
                    Assert.That(player.IsControlBlocked, Is.False);
                    Assert.That(Time.timeScale, Is.EqualTo(1f));
                    Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains(id), Is.EqualTo(stage == "exit-reveal"));
                    Assert.That(player.Orientation.FacingDirection,
                        Is.EqualTo(stage == "exit-reveal" ? Vector2.left : originalFacing));

                    service.Started -= onStarted;
                    Assert.That(service.TryStart(replacement, out var next), Is.True);
                    old.Cancel();
                    for (var frame = 0; frame < 3; frame++) yield return null;
                    Assert.That(service.ActiveRun, Is.SameAs(next));
                    Assert.That(next.IsRunning, Is.True);
                    Assert.That(player.IsControlBlocked, Is.True);
                    Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains(replacement.CutsceneId), Is.False);
                }
                finally
                {
                    service.Started -= onStarted;
                    service.Cancel();
                    Object.Destroy(definition);
                    Object.Destroy(replacement);
                }
            }
        }

        [UnityTest]
        public IEnumerator MusicOverrideReleasesOnCompletionSkipCancellationAndExplicitRelease()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var catalog = Resources.Load<MusicCatalog>(MusicCatalog.ResourceName);
            var director = LiveGame.Get<MusicDirector>();
            var cues = catalog.EnabledDefinitions.ToArray();
            Assert.That(cues.Length, Is.GreaterThanOrEqualTo(2));
            var environmentCue = cues[0];
            var overrideCue = cues[1];
            var updatedPreset = environmentCue.presets.Last().id;
            var previousCount = director.Requests.Count;
            using var environment = director.Requests.Request(environmentCue, environmentCue.presets[0].id);
            foreach (var terminal in new[] { "complete", "skip", "cancel", "release" })
            {
                var id = "fixture:music-" + terminal;
                var definition = CreatePhaseDefinition(id, terminal == "complete" ? 0.05 : 60);
                var setup = CutsceneSequenceCompiler.Compile(new JArray(new JObject { ["id"] = "music", ["action"] = "music.override",
                    ["arguments"] = new JObject { ["cue"] = overrideCue.id, ["preset"] = overrideCue.presets[0].id, ["quantization"] = "Immediate", ["fadeSeconds"] = 0.05 } }), id, out var setupSteps, "setup");
                definition.Configure(id, definition.MapId, definition.Lua, definition.Steps, true,
                    definition.OnComplete, setup, setupSteps, new CutsceneTransition(enabled: false));
                try
                {
                    Assert.That(service.TryStart(definition, out var run), Is.True);
                    Assert.That(director.Requests.Winner.Cue, Is.SameAs(overrideCue));
                    environment.Update(environmentCue, updatedPreset);
                    if (terminal == "skip") Assert.That(run.Skip(), Is.True);
                    else if (terminal == "cancel") run.Cancel();
                    else if (terminal == "release")
                    {
                        var api = new MusicLuaApi(catalog);
                        LiveGame.Inject(api);
                        api.Release();
                    }
                    var deadline = Time.realtimeSinceStartupAsDouble + 5;
                    while (terminal == "complete" && run.IsRunning && Time.realtimeSinceStartupAsDouble < deadline) yield return null;
                    Assert.That(director.Requests.Winner, Is.SameAs(environment));
                    Assert.That(director.Requests.Winner.Preset, Is.EqualTo(updatedPreset));
                    Assert.That(director.Requests.Count, Is.EqualTo(previousCount + 1));
                }
                finally { service.Cancel(); Object.Destroy(definition); }
            }
        }

        private static CutsceneDefinition CreatePhaseDefinition(string id, double wait, string completionActor = "player")
        {
            JObject Turn(string stepId, string character, string direction) => new()
            {
                ["id"] = stepId, ["action"] = "characters.faceDirection",
                ["arguments"] = new JObject { ["character"] = character, ["direction"] = direction }
            };
            var ids = new HashSet<string>(StringComparer.Ordinal);
            var setup = CutsceneSequenceCompiler.Compile(new JArray(Turn("stage", "player", "East")), id, out var setupSteps, "setup", ids);
            var sequence = CutsceneSequenceCompiler.Compile(new JArray(new JObject
            {
                ["id"] = "wait", ["action"] = "cutscene.wait", ["arguments"] = new JObject { ["seconds"] = wait }
            }), id, out var steps, "sequence", ids);
            var completion = CutsceneSequenceCompiler.Compile(new JArray(Turn("finish", completionActor, "West")), id,
                out var completionSteps, "completion", ids);
            var definition = ScriptableObject.CreateInstance<CutsceneDefinition>();
            definition.Configure(id, LiveGame.Get<MapManager>().CurrentMap.MapId, sequence, steps, true,
                new CutsceneCompletion(Array.Empty<CutsceneCharacterPlacement>(), $"GameState.Story.Set('{id}', true)", completion, completionSteps), setup, setupSteps,
                new CutsceneTransition(enabled: false));
            return definition;
        }

        [UnityTest]
        public IEnumerator PlacingSpawnedActorsSynchronizesPhysicsAndSavedRecordsAndRestoresOnCancel()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var map = LiveGame.Get<MapManager>().CurrentMap;
            var spawn = LiveGame.Get<WorldObjectSpawner>().SpawnedObjects.Single(value => value.PersistentId == "cutscene-prototype-host-01");
            var character = spawn.GetComponentInChildren<GameCharacter>();
            character.Orientation.ForceDirection(Vector2.right);
            foreach (var terminal in new[] { "cancel", "skip", "complete" })
            {
                var id = "fixture:place-" + terminal;
                JObject Place(string step, int x) => new()
                {
                    ["id"] = step, ["action"] = "characters.place",
                    ["arguments"] = new JObject { ["character"] = spawn.PersistentId, ["position"] = new JObject { ["x"] = x, ["y"] = 104 } }
                };
                var ids = new HashSet<string>(StringComparer.Ordinal);
                var setup = CutsceneSequenceCompiler.Compile(new JArray(Place("stage", 168)), id, out var setupSteps, "setup", ids);
                var sequence = CutsceneSequenceCompiler.Compile(new JArray(new JObject
                {
                    ["id"] = "wait", ["action"] = "cutscene.wait",
                    ["arguments"] = new JObject { ["seconds"] = terminal == "complete" ? 0 : 60 }
                }), id, out var steps, "sequence", ids);
                var completion = CutsceneSequenceCompiler.Compile(new JArray(Place("finish", 171)), id, out var completionSteps, "completion", ids);
                var definition = ScriptableObject.CreateInstance<CutsceneDefinition>();
                definition.Configure(id, map.MapId, sequence, steps, true,
                    new CutsceneCompletion(Array.Empty<CutsceneCharacterPlacement>(), "", completion, completionSteps), setup, setupSteps,
                    new CutsceneTransition(enabled: false));
                try
                {
                    var before = spawn.transform.position;
                    Assert.That(service.TryStart(definition, out var run), Is.True);
                    Assert.That(Vector3.Distance(character.Graphics.position, new MapPosition(168, 104).ToWorld(map)), Is.LessThan(0.0001f));
                    Assert.That(Vector3.Distance(spawn.State.position, spawn.transform.position), Is.LessThan(0.0001f));
                    if (terminal == "cancel") run.Cancel();
                    else if (terminal == "skip") Assert.That(run.Skip(), Is.True);
                    else
                    {
                        for (var frame = 0; frame < 30 && run.IsRunning; frame++) yield return null;
                        Assert.That(run.IsRunning, Is.False);
                    }
                    if (terminal == "cancel") Assert.That(Vector3.Distance(spawn.transform.position, before), Is.LessThan(0.0001f));
                    else Assert.That(Vector3.Distance(character.Graphics.position, new MapPosition(171, 104).ToWorld(map)), Is.LessThan(0.0001f));
                    Assert.That(Vector2.Distance(character.GetComponent<Rigidbody2D>().position, character.transform.position), Is.LessThan(0.0001f));
                    Assert.That(Vector3.Distance(spawn.State.position, spawn.transform.position), Is.LessThan(0.0001f));
                    Assert.That(character.Orientation.FacingDirection, Is.EqualTo(Vector2.right));
                }
                finally { service.Cancel(); Object.Destroy(definition); }
            }
        }

        [UnityTest]
        public IEnumerator DialogueChoicePersistsImmediatelyWhileCompletionActionsWait()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var dialogue = CreateDialogue("fixture:decision-dialogue",
                new VulcanusDialogueLineNode("entry", "", "", "May I enter?", "", "choice"),
                new VulcanusDialogueChoiceNode("choice", new[] { new VulcanusDialogueChoiceOption("yes", "Show invitation", "", "", "answer") }),
                new VulcanusDialogueActionNode("answer", "GameState.Story.Set('fixture:dialogue-choice', true)", "response"),
                new VulcanusDialogueLineNode("response", "", "", "You may enter.", "", "end"),
                new VulcanusDialogueEndNode("end"));
            _catalog.Synchronize(_catalog.Entries.Select(entry => entry.Definition).Append(dialogue));
            var definition = CreateCutscene("fixture:decision", false, "fixture:completion", dialogue.DialogueId);
            try
            {
                Assert.That(service.TryStart(definition, out var run), Is.True);
                yield return null;
                Assert.That(_runner.TryAdvanceActiveDialogue(), Is.True);
                for (var frame = 0; frame < 20 && _runner.ActiveContext.CurrentNode is not VulcanusDialogueChoiceNode; frame++)
                    yield return null;
                using (var key = KeyDownEvent.GetPooled('\0', KeyCode.Alpha1, EventModifiers.None))
                {
                    key.target = _document.rootVisualElement.Q("dialogue-overlay");
                    ((VisualElement)key.target).SendEvent(key);
                }
                for (var frame = 0; frame < 20 && !LiveGame.Get<GameState>().Story.Has("fixture:dialogue-choice"); frame++)
                    yield return null;
                Assert.That(LiveGame.Get<GameState>().Story.Has("fixture:dialogue-choice"), Is.True);
                Assert.That(LiveGame.Get<GameState>().Story.Has("fixture:completion"), Is.False);
                run.Cancel();
                Assert.That(LiveGame.Get<GameState>().Story.Has("fixture:dialogue-choice"), Is.True);
                Assert.That(LiveGame.Get<GameState>().Story.Has("fixture:completion"), Is.False);
                Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains(definition.CutsceneId), Is.False);
            }
            finally { service.Cancel(); Object.Destroy(definition); Object.Destroy(dialogue); }
        }

        [UnityTest]
        public IEnumerator NpcMovesFacesPlayerAndCommitsOnlyAfterGoodbye()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var spawn = LiveGame.Get<WorldObjectSpawner>().SpawnedObjects.Single(value => value.PersistentId == "cutscene-prototype-host-01");
            var character = spawn.GetComponent<GameCharacter>();
            var anchor = LiveGame.Get<MapManager>().CurrentMap.GetComponentsInChildren<VulcanusMapAnchor>(true)
                .Single(value => value.AnchorId == "prototype-meeting");
            Assert.That(service.TryStart(NpcMovement, out var run), Is.True);
            Vector3? committedPosition = null;
            Vector3? committedSavedPosition = null;
            Vector3? committedFeet = null;
            service.Finished += finished =>
            {
                if (finished != run) return;
                committedPosition = spawn.transform.position;
                committedSavedPosition = spawn.State.position;
                committedFeet = character.Graphics.position;
            };
            var deadline = Time.realtimeSinceStartup + 15;
            while (run.IsRunning && !_runner.IsDialogueActive && Time.realtimeSinceStartup < deadline)
                yield return null;
            Assert.That(_runner.CurrentDialogueId, Is.EqualTo("fixture:talk"));
            Assert.That(Vector2.Distance(character.GetComponent<Rigidbody2D>().position, anchor.transform.position), Is.LessThanOrEqualTo(0.04f));
            Assert.That(character.Orientation.FacingDirection.x, Is.GreaterThan(0));
            Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains(NpcMovement.CutsceneId), Is.False);
            Assert.That(_runner.TryAdvanceActiveDialogue(), Is.True);
            for (var frame = 0; frame < 20 && _runner.ActiveContext.CurrentNode is not VulcanusDialogueChoiceNode; frame++) yield return null;
            using (var key = KeyDownEvent.GetPooled('\0', KeyCode.Alpha1, EventModifiers.None))
            {
                key.target = _document.rootVisualElement.Q("dialogue-overlay");
                ((VisualElement)key.target).SendEvent(key);
            }
            for (var frame = 0; frame < 20 && service.IsRunning; frame++) yield return null;
            Assert.That(run.IsRunning, Is.False);
            Assert.That(Vector3.Distance(committedFeet.Value, anchor.transform.position), Is.LessThan(0.001f));
            Assert.That(committedSavedPosition, Is.EqualTo(committedPosition));
            Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains(NpcMovement.CutsceneId), Is.True);
            Assert.That(character.Controller.IsMovementOwned, Is.False);
            Assert.That(character.IsControlBlocked, Is.False);
            AssertClosed();
            var slot = "cutscene_npc_" + Guid.NewGuid().ToString("N");
            try
            {
                LiveGame.Get<GameStateManager>().Save(slot);
                Assert.That(LiveGame.Get<GameSaveService>().TryLoad(slot, out var saved), Is.True);
                Assert.That(saved.world.TryGet<SpawnedObjectState>(LiveGame.Get<LevelManager>().CurrentLocationData.id, spawn.PersistentId, out var placement), Is.True);
                Assert.That(placement.position, Is.EqualTo(spawn.transform.position));
                Assert.That(saved.story.CompletedCutscenes.Contains(NpcMovement.CutsceneId), Is.True);
            }
            finally { File.Delete(GameSaveService.GetSavePath(slot)); }
        }

        [UnityTest]
        public IEnumerator CancellingNpcMovementRestoresPlacementWhileSkippingCommitsThePreparedEndpoint()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var spawn = LiveGame.Get<WorldObjectSpawner>().SpawnedObjects.Single(value => value.PersistentId == "cutscene-prototype-host-01");
            var character = spawn.GetComponent<GameCharacter>();
            var original = spawn.transform.position;
            Assert.That(service.TryStart(NpcMovement, out var cancelled), Is.True);
            yield return null;
            Assert.That(character.Controller.IsMovementOwned, Is.True);
            cancelled.Cancel();
            Assert.That(cancelled.IsRunning, Is.False);
            Assert.That(spawn.transform.position, Is.EqualTo(original));
            Assert.That(spawn.State.position, Is.EqualTo(original));
            Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains(NpcMovement.CutsceneId), Is.False);
            Assert.That(character.Controller.IsMovementOwned, Is.False);
            Assert.That(character.Controller.CurrentVelocity, Is.EqualTo(Vector2.zero));
            Assert.That(service.TryStart(NpcMovement, out var skipped), Is.True);
            yield return null;
            Assert.That(skipped.Skip(), Is.True);
            Assert.That(skipped.Skipped, Is.True);
            Assert.That(spawn.transform.position, Is.Not.EqualTo(original));
            Assert.That(spawn.State.position, Is.EqualTo(spawn.transform.position));
            Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains(NpcMovement.CutsceneId), Is.True);
            Assert.That(character.IsControlBlocked, Is.False);
            AssertClosed();
        }

        [UnityTest]
        public IEnumerator RestoringThePlayerInsideTheTriggerDoesNotRestartACancelledCutscene()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var player = LiveGame.Player;
            var body = player.GetComponent<Rigidbody2D>();
            var original = body.position;
            void PlacePlayer(Vector2 position)
            {
                player.transform.position = position;
                body.position = position;
                Physics2D.SyncTransforms();
            }
            var definition = CreatePhaseDefinition("fixture:visit", 60);
            var catalog = ScriptableObject.CreateInstance<CutsceneCatalog>();
            catalog.Synchronize(new[] { definition });
            var previousCatalog = typeof(CutsceneRunner).GetField("_catalog", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(service);
            Set(service, "_catalog", catalog);
            var owner = new GameObject("Cutscene visit trigger");
            owner.SetActive(false);
            owner.transform.position = player.transform.position;
            var area = owner.AddComponent<BoxCollider2D>();
            area.isTrigger = true;
            area.size = Vector2.one * 2f;
            owner.AddComponent<CutsceneTrigger>().Configure(definition.CutsceneId);
            LiveGame.Inject(owner.GetComponent<CutsceneTrigger>());
            var starts = 0;
            Action<CutsceneRun> onStart = _ => starts++;
            service.Started += onStart;
            try
            {
                owner.SetActive(true);
                yield return new WaitForFixedUpdate();
                Assert.That(starts, Is.EqualTo(1));
                PlacePlayer(original + Vector2.right * 4f);
                yield return new WaitForFixedUpdate();
                yield return null;
                service.Cancel(); // The setup's player binding restores the captured position.
                Assert.That(body.position, Is.EqualTo(original));
                for (var frame = 0; frame < 3; frame++) yield return new WaitForFixedUpdate();
                Assert.That(starts, Is.EqualTo(1), "Restoration must not count as another player visit.");
                Assert.That(service.IsRunning, Is.False);
                Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains(definition.CutsceneId), Is.False);

                PlacePlayer(original + Vector2.right * 4f);
                for (var frame = 0; frame < 3; frame++) yield return new WaitForFixedUpdate();
                var exitColliders = ((HashSet<Collider2D>)typeof(CutsceneTrigger)
                    .GetField("_playerColliders", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(owner.GetComponent<CutsceneTrigger>())).Count;
                var exitOverlap = area.Distance(player.GetComponent<Collider2D>()).isOverlapped;
                PlacePlayer(original);
                for (var frame = 0; frame < 3; frame++) yield return new WaitForFixedUpdate();
                Assert.That(starts, Is.EqualTo(2), $"A later genuine visit can retry the cancelled scene. Exit colliders={exitColliders}, overlap={exitOverlap}, blocked={player.IsControlBlocked}, position={body.position}, expected={original}.");
            }
            finally
            {
                service.Started -= onStart;
                service.Cancel();
                Object.Destroy(owner);
                Set(service, "_catalog", previousCatalog);
                Object.Destroy(catalog);
                Object.Destroy(definition);
            }
        }

        [UnityTest]
        public IEnumerator InitialOverlapDeduplicatesPlayerCollidersAndBusyTriggersNeverQueue()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var definition = CreateCutscene("fixture:trigger", false, "completed", "fixture:talk");
            var catalog = ScriptableObject.CreateInstance<CutsceneCatalog>();
            catalog.Synchronize(new[] { definition });
            var originalCatalog = typeof(CutsceneRunner).GetField("_catalog", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(service);
            Set(service, "_catalog", catalog);
            var owner = new GameObject("Initial-overlap trigger fixture");
            owner.SetActive(false);
            owner.transform.position = LiveGame.Player.transform.position;
            var area = owner.AddComponent<BoxCollider2D>();
            area.isTrigger = true;
            area.size = Vector2.one * 2;
            var trigger = owner.AddComponent<CutsceneTrigger>();
            trigger.Configure(definition.CutsceneId);
            LiveGame.Inject(trigger);
            var duplicate = LiveGame.Player.gameObject.AddComponent<BoxCollider2D>();
            try
            {
                Assert.That(service.TryStart(definition, out var busy), Is.True);
                owner.SetActive(true);
                busy.Cancel();
                for (var frame = 0; frame < 3; frame++) yield return null;
                Assert.That(service.IsRunning, Is.False, "A busy initial-overlap request must never queue.");
                owner.SetActive(false);
                var starts = 0;
                Action<CutsceneRun> count = _ => starts++;
                service.Started += count;
                try
                {
                    owner.SetActive(true);
                    for (var frame = 0; frame < 3; frame++) yield return null;
                    Assert.That(starts, Is.EqualTo(1));
                    Assert.That(service.IsRunning, Is.True);
                    Assert.That(service.ActiveRun.Skip(), Is.False, "Skip permission is authored, not implied by dialogue input.");
                }
                finally { service.Started -= count; }
                service.Cancel();
                AssertClosed();
            }
            finally
            {
                service.Cancel();
                Object.Destroy(owner); Object.Destroy(duplicate);
                Set(service, "_catalog", originalCatalog);
                Object.Destroy(catalog); Object.Destroy(definition);
            }
        }

        [UnityTest]
        public IEnumerator DisablingTheCutsceneOwnerClosesItsDialogueWithoutCompleting()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var definition = CreateCutscene("fixture:disable", true, "fixture_disabled", "fixture:talk");
            try
            {
                Assert.That(service.TryStart(definition, out var run), Is.True);
                yield return null;
                Assert.That(_runner.IsDialogueActive, Is.True);
                service.enabled = false;
                Assert.That(run.IsRunning, Is.False);
                Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains("fixture:disable"), Is.False);
                Assert.That(LiveGame.Player.IsControlBlocked, Is.False);
                AssertClosed();
            }
            finally { service.enabled = true; Object.Destroy(definition); }
        }

        [UnityTest]
        public IEnumerator ObstructedMovementReportsTheAuthoredStepAndReleasesAllClaims()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var character = LiveGame.Get<WorldObjectSpawner>().SpawnedObjects.Single(value => value.PersistentId == "cutscene-prototype-host-01");
            var anchor = LiveGame.Get<MapManager>().CurrentMap.GetComponentsInChildren<VulcanusMapAnchor>(true)
                .Single(value => value.AnchorId == "prototype-meeting");
            var obstacle = new GameObject("Cutscene obstruction fixture");
            var footprint = character.GetComponentsInChildren<Collider2D>().Single(value => !value.isTrigger);
            var mask = Physics2D.GetLayerCollisionMask(footprint.gameObject.layer);
            obstacle.layer = Enumerable.Range(0, 32).First(layer => (mask & (1 << layer)) != 0);
            obstacle.transform.position = footprint.bounds.center + (anchor.transform.position - character.transform.position) * 0.5f;
            obstacle.AddComponent<BoxCollider2D>().size = new Vector2(0.05f, 4f);
            Physics2D.SyncTransforms();
            try
            {
                Assert.That(service.TryStart(NpcMovement, out var run), Is.True);
                var update = typeof(CutsceneRunner).GetMethod("Update", BindingFlags.Instance | BindingFlags.NonPublic);
                update.Invoke(service, null); // Starts the movement action.
                var error = Assert.Throws<TargetInvocationException>(() => update.Invoke(service, null));
                Assert.That(error.InnerException.Message, Does.Contain("step 'approach'"));
                Assert.That(run.IsRunning, Is.False);
                Assert.That(character.GetComponent<GameCharacter>().IsControlBlocked, Is.False);
                Assert.That(character.GetComponent<GameCharacter>().Controller.IsMovementOwned, Is.False);
                Assert.That(LiveGame.Player.IsControlBlocked, Is.False);
                Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains(NpcMovement.CutsceneId), Is.False);
                AssertClosed();
                yield return null;
            }
            finally { service.Cancel(); Object.Destroy(obstacle); }
        }

        [UnityTest]
        public IEnumerator LocationChangeCancelsBeforeCapturingTransientNpcPlacement()
        {
            var service = LiveGame.Get<CutsceneRunner>();
            var level = LiveGame.Get<LevelManager>();
            var originalMap = level.CurrentLocationData;
            var spawn = LiveGame.Get<WorldObjectSpawner>().SpawnedObjects.Single(value => value.PersistentId == "cutscene-prototype-host-01");
            var original = spawn.transform.position;
            Assert.That(service.TryStart("base:cutscene-prototype", out var run), Is.True);
            yield return null;
            // Reload the registered location through the normal leave/load/ready boundary.
            level.LoadLocation(originalMap, "", Vector2.down);
            Assert.That(run.IsRunning, Is.False);
            var deadline = Time.realtimeSinceStartup + 15;
            while (!level.SceneReady && Time.realtimeSinceStartup < deadline) yield return null;
            Assert.That(level.SceneReady, Is.True);
            Assert.That(LiveGame.Get<GameState>().Story.CompletedCutscenes.Contains("base:cutscene-prototype"), Is.False);
            Assert.That(LiveGame.Player.IsControlBlocked, Is.False);
            AssertClosed();
            var restored = LiveGame.Get<WorldObjectSpawner>().SpawnedObjects.Single(value => value.PersistentId == "cutscene-prototype-host-01");
            Assert.That(Vector3.Distance(restored.transform.position, original), Is.LessThan(0.001f));
            Assert.That(Vector3.Distance(restored.State.position, original), Is.LessThan(0.001f));
        }

        [UnityTest]
        public IEnumerator StoppingTheLuaSessionClosesItsDialogueAndScriptErrorsDoNotContinue()
        {
            var api = new DialogueLuaApi(_runner, LiveGame.Player);
            using (var run = Start(api, "Dialogue.Play('fixture:talk'); error('Must not continue')"))
            {
                run.Tick(0);
                yield return null;
                run.Cancel();
                Assert.That(run.IsRunning, Is.False);
                AssertClosed();
            }
            LogAssert.Expect(LogType.Error, new Regex("Action failed in 'fixture:error'"));
            LogAssert.Expect(LogType.Error, new Regex("Action node 'entry' failed"));
            using var broken = Start(api, "Dialogue.Play('fixture:error'); Dialogue.Play('fixture:talk')");
            broken.Tick(0);
            Assert.That(() => broken.Tick(0),
                Throws.InvalidOperationException.With.Message.Contains("before reaching the end"));
            AssertClosed();
        }

        [UnityTest]
        public IEnumerator CutsceneBindingChecksLaterReferencesBeforeStartingEarlierActions()
        {
            var player = LiveGame.Player;
            var map = LiveGame.Get<MapManager>().CurrentMap;
            var anchor = map.GetComponentsInChildren<VulcanusMapAnchor>(true).First();
            var position = player.GetComponent<Rigidbody2D>().position;
            var facing = player.Orientation.FacingDirection;
            var definition = ScriptableObject.CreateInstance<CutsceneDefinition>();
            try
            {
                var walk = Step("walk", "characters.moveTo", ("character", "player"), ("destination", anchor.AnchorId));
                ConfigureDefinition(definition, map.MapId, walk, Step("talk", "dialogue.play", ("dialogue", "missing-dialogue")));
                var error = Assert.Throws<InvalidOperationException>(() => CutsceneBindings.BindCurrentMap(definition, _runner, LiveGame.Get<LuaRuntime>()));
                Assert.That(error.Message, Does.Contain("fixture:binding").And.Contain("step 'talk'").And.Contain("missing-dialogue"));

                foreach (var invalid in new[]
                {
                    Step("missing-character", "characters.moveTo", ("character", "missing"), ("destination", anchor.AnchorId)),
                    Step("missing-anchor", "characters.moveTo", ("character", "player"), ("destination", "missing")),
                    Step("missing-target", "characters.face", ("character", "player"), ("target", "missing"))
                })
                {
                    ConfigureDefinition(definition, map.MapId, invalid);
                    error = Assert.Throws<InvalidOperationException>(() => CutsceneBindings.BindCurrentMap(definition, _runner, LiveGame.Get<LuaRuntime>()));
                    Assert.That(error.Message, Does.Contain($"step '{invalid.Id}'"));
                }

                var talk = Step("talk", "dialogue.play", ("dialogue", "fixture:talk"));
                ConfigureDefinition(definition, "another-map", walk, talk);
                Assert.That(() => CutsceneBindings.BindCurrentMap(definition, _runner, LiveGame.Get<LuaRuntime>()),
                    Throws.InvalidOperationException.With.Message.Contains("another-map"));

                ConfigureDefinition(definition, map.MapId, walk, talk);
                var bindings = CutsceneBindings.BindCurrentMap(definition, _runner, LiveGame.Get<LuaRuntime>());
                Assert.That(bindings.Describe().modules.Select(module => module.path), Is.EquivalentTo(new[] { "Characters", "Dialogue" }));
                ConfigureDefinition(definition, map.MapId, talk);
                bindings = CutsceneBindings.BindCurrentMap(definition, _runner, LiveGame.Get<LuaRuntime>());
                Assert.That(bindings.Describe().modules.Select(module => module.path), Is.EqualTo(new[] { "Dialogue" }));
                ConfigureDefinition(definition, map.MapId, walk);
                bindings = CutsceneBindings.BindCurrentMap(definition, null, LiveGame.Get<LuaRuntime>());
                Assert.That(bindings.Describe().modules.Select(module => module.path), Is.EqualTo(new[] { "Characters" }));
                Assert.That(player.Controller.IsMovementOwned, Is.False);
                Assert.That(player.GetComponent<Rigidbody2D>().position, Is.EqualTo(position));
                Assert.That(player.Orientation.FacingDirection, Is.EqualTo(facing));
                AssertClosed();
                yield return null;
            }
            finally { Object.Destroy(definition); }
        }

        private static CutsceneStep Step(string id, string action, params (string Name, string Value)[] arguments) =>
            new(id, action, arguments.Select(argument => new CutsceneArgument(argument.Name, argument.Value)).ToArray());

        private static void ConfigureDefinition(CutsceneDefinition definition, string map, params CutsceneStep[] steps)
        {
            var sequence = new JArray(steps.Select(step => new JObject
            {
                ["id"] = step.Id, ["action"] = step.ActionId,
                ["arguments"] = new JObject(step.Arguments.Select(argument => new JProperty(argument.Name, argument.Value)))
            }));
            var compiled = CutsceneSequenceCompiler.Compile(sequence, "fixture:binding", out var importedSteps);
            definition.Configure("fixture:binding", map, compiled, importedSteps, false,
                new CutsceneCompletion(Array.Empty<CutsceneCharacterPlacement>(), "", "", Array.Empty<CutsceneStep>()), "", Array.Empty<CutsceneStep>(),
                new CutsceneTransition(enabled: false));
        }

        private void AssertClosed()
        {
            Assert.That(_runner.IsDialogueActive, Is.False);
            Assert.That(LiveGame.Get<UrGUIManager>().HasOpenScreens, Is.False);
            Assert.That(LiveGame.Get<UrGUIManager>().IsGameClockPaused, Is.False);
            Assert.That(LiveGame.Get<UrGUIManager>().IsCharacterPaused(LiveGame.Player), Is.False);
        }

        [UnityTearDown]
        public IEnumerator TearDown()
        {
            LiveGame.Get<CutsceneRunner>().Cancel();
            _catalog.Synchronize(_authoredDialogues);
            Object.Destroy(_root);
            yield return null;
            foreach (var asset in new Object[] { _talk, _end, _error, _npcMovement }) Object.Destroy(asset);
            _npcMovement = null;
            yield return new ExitPlayMode();
        }

        private static LuaExecutionSession Start(DialogueLuaApi api, string lua) =>
            VulcanusLuaEngine.StartSession(new LuaBindingRegistry(api) { Runtime = LiveGame.Get<LuaRuntime>() }, lua, "fixture:dialogue");

        private static CutsceneDefinition CreateNpcMovementDefinition()
        {
            const string actor = "cutscene-prototype-host-01";
            const string anchor = "prototype-meeting";
            var sequence = new JArray(
                new JObject { ["id"] = "approach", ["action"] = "characters.moveTo", ["arguments"] = new JObject { ["character"] = actor, ["destination"] = anchor } },
                new JObject { ["id"] = "face", ["action"] = "characters.face", ["arguments"] = new JObject { ["character"] = actor, ["target"] = "player" } },
                new JObject { ["id"] = "talk", ["action"] = "dialogue.play", ["arguments"] = new JObject { ["dialogue"] = "fixture:talk" } });
            var lua = CutsceneSequenceCompiler.Compile(sequence, "fixture:npc-movement", out var steps);
            var definition = ScriptableObject.CreateInstance<CutsceneDefinition>();
            definition.Configure("fixture:npc-movement", LiveGame.Get<MapManager>().CurrentMap.MapId,
                lua, steps, true, new CutsceneCompletion(new[] { new CutsceneCharacterPlacement(actor, anchor, null) }, "", "", Array.Empty<CutsceneStep>()),
                "", Array.Empty<CutsceneStep>(), new CutsceneTransition(enabled: false));
            return definition;
        }

        private static VulcanusDialogueAsset CreateDialogue(string id, params VulcanusDialogueNode[] nodes)
        {
            var dialogue = ScriptableObject.CreateInstance<VulcanusDialogueAsset>();
            dialogue.Configure(null, 1, id, id, "", false, "", "entry", Array.Empty<string>(), "", "", nodes,
                Array.Empty<VulcanusDialogueAsset.ImportedMessage>(), Array.Empty<string>());
            return dialogue;
        }

    }
}

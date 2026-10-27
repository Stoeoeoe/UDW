using System;
using System.Reflection;
using Core.Common.Editor;
using Core.Game;
using Core.Location;
using DG.Tweening;
using NUnit.Framework;
using UI.Shared;
using UnityEngine;

namespace Core.Scripting.Editor
{
    public sealed class CutsceneTransitionTests
    {
        private GameTestFixture _fixture;
        private CutsceneRunner _runner;
        private UrGUIManager _gui;
        private CanvasGroup _group;
        private CutsceneRun _run;
        private LuaExecutionSession _session;
        private Observer _observer;

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Cutscene transition timing");
            _fixture.RegisterSingleton<GameStateManager>();
            _gui = _fixture.RegisterSingleton<UrGUIManager>();
            var panel = new GameObject("Fader", typeof(RectTransform), typeof(CanvasGroup), typeof(UnityEngine.UI.Image), typeof(ScreenFader));
            panel.transform.SetParent(_fixture.Root.transform, false);
            _group = panel.GetComponent<CanvasGroup>();
            panel.GetComponent<UnityEngine.UI.Image>().color = Color.black;
            var fader = panel.GetComponent<ScreenFader>();
            GameTestFixture.Invoke(fader, "Awake");
            fader.ShowSceneImmediately();
            Set(_gui, "screenFader", fader);
            _runner = _fixture.Root.AddComponent<CutsceneRunner>();
            Set(_runner, "_gui", _gui);
            var presentation = _fixture.Own(ScriptableObject.CreateInstance<CutscenePresentationSettings>());
            Set(presentation, "fadeSeconds", 0.3f);
            Set(presentation, "holdSeconds", 1.7f);
            Set(presentation, "revealSeconds", 0.12f);
            presentation.RequireValidConfiguration();
            Set(_runner, "_presentation", presentation);
            _observer = new Observer(_group);
            var bindings = new LuaBindingRegistry(_observer);
            var definition = _fixture.Own(ScriptableObject.CreateInstance<CutsceneDefinition>());
            definition.Configure("fixture:transition", "fixture:map", "Observer.Wait()",
                new[] { Step("wait", "test.wait") }, true,
                new CutsceneCompletion(Array.Empty<CutsceneCharacterPlacement>(), "", "Observer.Finish()", new[] { Step("finish", "test.finish") }),
                "Observer.Setup()", new[] { Step("setup", "test.setup") }, new CutsceneTransition());
            _session = VulcanusLuaEngine.StartSession(bindings, definition.Lua, definition.CutsceneId);
            var placements = Array.CreateInstance(typeof(CutsceneRun).Assembly.GetType("Core.Scripting.CutscenePlacement"), 0);
            _run = (CutsceneRun)Activator.CreateInstance(typeof(CutsceneRun), BindingFlags.Instance | BindingFlags.NonPublic,
                null, new object[] { _runner, definition, _session, placements, bindings, null }, null);
            Set(_runner, "<ActiveRun>k__BackingField", _run);
        }

        [TearDown]
        public void TearDown()
        {
            _session.Dispose();
            _gui.ResetTransition();
            _fixture.Dispose();
        }

        [Test]
        public void SetupAndStartedWaitUntilTheEntranceHasFadedToBlack()
        {
            var phase = typeof(CutsceneRunner).GetField("_transitionPhase", BindingFlags.Instance | BindingFlags.NonPublic);
            phase.SetValue(_runner, Enum.Parse(phase.FieldType, "EntranceCover"));
            Set(_runner, "_transition", typeof(UrGUIManager).GetMethod("CoverCutscene", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(_gui, new object[] { 0.3f, 1.7f }));
            var started = false;
            _runner.Started += _ =>
            {
                Assert.That(_group.alpha, Is.EqualTo(1));
                Assert.That(_observer.SetupApplied, Is.True);
                started = true;
            };
            Advance();
            Assert.That(_observer.SetupApplied, Is.False);
            Transition.Goto(0.15f);
            Advance();
            Assert.That(_group.alpha, Is.EqualTo(0.5f).Within(0.01));
            Assert.That(_observer.SetupApplied, Is.False);
            Assert.That(started, Is.False);
            Transition.Goto(1f);
            Advance();
            Assert.That(_group.alpha, Is.EqualTo(1));
            Assert.That(started, Is.False, "Setup and reveal wait for the hold on black.");
            Transition.Complete();
            Advance();
            Assert.That(started, Is.True);
            Assert.That(_session.ActionsStarted, Is.Zero);
        }

        [Test]
        public void SkipFadesToBlackBeforeDisposingTheActiveActionAndApplyingCompletion()
        {
            _session.Tick(0);
            Assert.That(_run.Skip(), Is.True);
            Assert.That(_observer.ActionDisposed, Is.False);
            Assert.That(_observer.CompletionApplied, Is.False);
            Transition.Goto(1f);
            Advance();
            Assert.That(_observer.ActionDisposed, Is.False);
            Assert.That(_observer.CompletionApplied, Is.False);
            Transition.Complete();
            Advance();
            Assert.That(_observer.ActionDisposed, Is.True);
            Assert.That(_observer.CompletionApplied, Is.True);
            Assert.That(GameState.Story.CompletedCutscenes.Contains(_run.Definition.CutsceneId), Is.True);
            Assert.That(_run.IsRunning, Is.True, "Input remains claimed through the exit reveal.");
        }

        [TestCase(-1f)]
        [TestCase(float.NaN)]
        [TestCase(float.PositiveInfinity)]
        public void GlobalSettingsRejectInvalidTimingsBeforePlayback(float value)
        {
            var settings = _fixture.Own(ScriptableObject.CreateInstance<CutscenePresentationSettings>());
            foreach (var field in new[] { "fadeSeconds", "holdSeconds", "revealSeconds" })
            {
                Set(settings, field, value);
                Assert.That(settings.ValidateConfiguration(), Is.Not.Empty, field);
                Assert.That(() => settings.RequireValidConfiguration(), Throws.ArgumentException);
                Set(settings, field, 0);
            }
        }

        private Tween Transition => (Tween)typeof(CutsceneRunner).GetField("_transition", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(_runner);
        private void Advance() => typeof(CutsceneRunner).GetMethod("AdvanceTransition", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(_runner, new object[] { _run });
        private static CutsceneStep Step(string id, string action) => new(id, action, Array.Empty<CutsceneArgument>());
        private static void Set(object owner, string name, object value) => owner.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(owner, value);

        [LuaModule("Observer")]
        public sealed class Observer : ILuaAction
        {
            private readonly CanvasGroup _group;
            public bool SetupApplied, CompletionApplied, ActionDisposed;
            public Observer(CanvasGroup group) => _group = group;
            [LuaAction("test.setup", "Setup", "Test", "Staging under cover.", "cutscene", Phases = new[] { "setup" })]
            public void Setup() { Assert.That(_group.alpha, Is.EqualTo(1)); SetupApplied = true; }
            [LuaAction("test.wait", "Wait", "Test", "Active action.", "cutscene", Phases = new[] { "sequence" })]
            public ILuaAction Wait() => this;
            [LuaAction("test.finish", "Finish", "Test", "Completion under cover.", "cutscene", Phases = new[] { "completion" })]
            public void Finish() { Assert.That(_group.alpha, Is.EqualTo(1)); CompletionApplied = true; }
            public bool IsCompleted => false;
            public void Tick(float deltaTime) { }
            public void Dispose() { Assert.That(_group.alpha, Is.EqualTo(1)); ActionDisposed = true; }
        }
    }
}

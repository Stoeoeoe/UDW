using Core.Dialogue.Vulcanus;
using Core.Catalogs;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Character;
using Core.Common.Editor;
using Core.Tile.Editor.Vulcanus;
using Input;
using NUnit.Framework;
using UI.Shared;
using UI.Shared.Editor;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;
using static Core.Common.Editor.Reflect;
using Object = UnityEngine.Object;

namespace Core.Dialogue.Vulcanus.Editor
{
    /// <summary>Exercises dialogue input through the authored UI map, including closing and restoring gameplay controls.</summary>
    public sealed class DialogueInputTests : GameTest
    {

        private InputManager _input;
        private UrGUIManager _gui;
        private MainCharacter _character;
        private VulcanusDialogueRunner _runner;
        private DefinitionCatalog _catalog;
        private VulcanusDialogueUIDocumentPresenter _presenter;
        private UIDocument _document;
        private readonly List<UnityEngine.Camera> _sceneMainCameras = new();
        private VisualElement Overlay => _document.rootVisualElement.Q("dialogue-overlay");

        [SetUp]
        public void SetUp()
        {
            // The presenter under test replaces the authored dialogue screen in the container.
            var root = new GameObject("Dialogue");
            root.SetActive(false);
            root.transform.SetParent(Game.Root.transform);
            _document = root.AddComponent<UIDocument>();
            _presenter = root.AddComponent<VulcanusDialogueUIDocumentPresenter>();
            Game.Use<IDialoguePresenter>(_presenter);
            _catalog = Game.Catalog<VulcanusDialogueAsset>();

            Game.Root.SetActive(true);
            _input = UIScreenPauseTests.CreateScreenServices(Game);
            _gui = Game.Start<UrGUIManager>(gui => gui.gameObject.SetActive(true));
            _character = Game.CreateCharacter();
            Game.Get<CharacterManager>().RegisterMainCharacter(_character);
            foreach (var sceneCamera in Object.FindObjectsByType<UnityEngine.Camera>(FindObjectsSortMode.None))
            {
                if (!sceneCamera.CompareTag("MainCamera")) continue;
                _sceneMainCameras.Add(sceneCamera);
                sceneCamera.tag = "Untagged";
            }
            var cameraRoot = new GameObject("Dialogue camera");
            cameraRoot.transform.SetParent(Game.Root.transform);
            cameraRoot.tag = "MainCamera";
            var camera = cameraRoot.AddComponent<UnityEngine.Camera>();
            camera.orthographic = true;
            camera.orthographicSize = 5f;
            camera.transform.position = new Vector3(0f, 0f, -10f);
            _document.panelSettings = Game.Own(Game.InjectObject(Object.Instantiate(
                AssetDatabase.LoadAssetAtPath<PanelSettings>("Assets/UI/InventoryScreen/InventoryPanelSettings.asset"))));
            var layout = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/UI/Dialogue/Vulcanus/VulcanusDialogueRuntime.uxml");
            _document.visualTreeAsset = layout;
            Game.InjectObject(_presenter);
            Set(_presenter, "document", _document);
            Set(_presenter, "layoutAsset", layout);
            Set(_presenter, "styleSheet", AssetDatabase.LoadAssetAtPath<StyleSheet>("Assets/UI/Dialogue/Vulcanus/VulcanusDialogueRuntime.uss"));
            Set(_presenter, "charactersPerSecond", 0f);
            root.SetActive(true);
            GameTestFixture.Invoke(_presenter, "OnEnable");
            _runner = Game.Get<VulcanusDialogueRunner>();
        }

        [TearDown]
        public void TearDown()
        {
            _runner.StopDialogue();

            foreach (var sceneCamera in _sceneMainCameras)
                sceneCamera.tag = "MainCamera";
            _sceneMainCameras.Clear();

        }

        private void Start(bool choice = false, string speaker = "")
        {
            var entry = choice
                ? "{ id: 'entry', type: 'choice', options: [{ id: 'yes', text: 'Yes', targetNodeId: 'end' }] }"
                : $"{{ id: 'entry', type: 'line', speaker: '{speaker}', text: 'A line of dialogue.', next: 'end' }}";
            var dialogue = VulcanusJson.Populate(Game.Asset<VulcanusDialogueAsset>(),
                $"{{ id: 'test:dialogue', startNodeId: 'entry', nodes: [{entry}, {{ id: 'end', type: 'end' }}] }}");
            _catalog.Synchronize(_catalog.Entries.Where(entry => entry.Definition is not VulcanusDialogueAsset)
                .Select(entry => entry.Definition).Append(dialogue));
            Assert.That(_runner.StartDialogue(dialogue.Id, _character), Is.True);
            Assert.That(_input.PlayerControls.enabled, Is.False);
            Assert.That(_input.ActiveMapName, Is.EqualTo("UI"));
        }

        private void Submit()
        {
            using var evt = NavigationSubmitEvent.GetPooled();
            evt.target = Overlay;
            Overlay.SendEvent(evt);
        }

        [TestCase(-3f, true)]
        [TestCase(0f, false)]
        [TestCase(3f, false)]
        public void LinesAndChoicesPlaceTheBoxOppositeTheHero(float heroY, bool atTop)
        {
            _character.transform.position = new Vector3(0f, heroY, 0f);
            Start();
            var anchor = _document.rootVisualElement.Q("dialogue-anchor");
            Assert.That(anchor.ClassListContains("is-top"), Is.EqualTo(atTop));
            _runner.StopDialogue();

            _character.transform.position = new Vector3(0f, -heroY, 0f);
            Start(choice: true);
            Assert.That(anchor.ClassListContains("is-top"), Is.EqualTo(heroY > 0f));
        }

        [Test]
        public void DialogueFillsTheViewportAndRendersAtTheSelectedEdge()
        {
            _character.transform.position = new Vector3(0f, 3f, 0f);
            Start();
            var viewport = LayOut();
            var panel = _document.rootVisualElement.Q("dialogue-panel");
            Assert.That(Overlay.worldBound.height, Is.EqualTo(viewport.height).Within(1f));
            Assert.That(panel.parent.worldBound.yMax, Is.EqualTo(viewport.yMax - 24f).Within(1f),
                "Bottom placement must move the rendered box, not just set its class.");
            _runner.StopDialogue();

            _character.transform.position = new Vector3(0f, -3f, 0f);
            Start(choice: true);
            LayOut();
            Assert.That(panel.worldBound.yMin, Is.EqualTo(viewport.yMin + 24f).Within(1f));
        }

        // Runtime panels only lay out when the Game view repaints, which edit-mode tests cannot rely on.
        private Rect LayOut()
        {
            var panel = Overlay.panel;
            GameTestFixture.Invoke(panel, "UpdateForRepaint");
            var viewport = panel.visualTree.worldBound;
            Assert.That(viewport.height, Is.GreaterThan(0f), "The runtime panel did not lay out.");
            return viewport;
        }

        [TestCase("base:fabia")]
        [TestCase("")]
        public void TheRunnerReportsTheSpeakerOnlyWhileALineIsActive(string speaker)
        {
            Start(speaker: speaker);
            Assert.That(_runner.CurrentSpeakerId, Is.EqualTo(speaker));
            _runner.StopDialogue();
            Assert.That(_runner.CurrentSpeakerId, Is.Null);
        }

        private void SetKey(KeyCode key)
        {
            using var evt = KeyDownEvent.GetPooled('\0', key, EventModifiers.None);
            evt.target = Overlay;
            Overlay.SendEvent(evt);
        }

        [Test]
        public void SubmitAdvancesWhileGameplayInputIsDisabled()
        {
            Start();
            Assert.That(Read<bool>(_presenter, "_waitingForAdvance"), Is.True);
            Submit();
            Assert.That(Read<bool>(_presenter, "_waitingForAdvance"), Is.False);
        }

        [Test]
        public void SpaceAdvancesWhileGameplayInputIsDisabled()
        {
            Start();
            SetKey(KeyCode.Space);
            Assert.That(Read<bool>(_presenter, "_waitingForAdvance"), Is.False);
        }

        [Test]
        public void ClickingAdvancesTheLine()
        {
            Start();
            using var evt = ClickEvent.GetPooled(new Event { type = EventType.MouseUp, button = 0 });
            evt.target = Overlay;
            Overlay.SendEvent(evt);
            Assert.That(Read<bool>(_presenter, "_waitingForAdvance"), Is.False);
        }

        [Test]
        public void DialogueHasNoCloseButton()
        {
            Start();
            Assert.That(_document.rootVisualElement.Q<Button>("dialogue-close"), Is.Null);
            Assert.That(_document.rootVisualElement.Q<Label>("dialogue-hint").text, Does.Not.Contain("Esc"));
        }

        [TestCase(false)]
        [TestCase(true)]
        public void NavigationCancelLeavesLinesAndChoicesOpen(bool choice)
        {
            Start(choice);
            using var evt = NavigationCancelEvent.GetPooled();
            evt.target = Overlay;
            Overlay.SendEvent(evt);
            AssertDialogueWaiting(choice);
        }

        [Test]
        public void NumberKeySelectsTheVisibleChoice()
        {
            Start(true);
            Assert.That(_document.rootVisualElement.Q("dialogue-choices").childCount, Is.EqualTo(1));
            SetKey(KeyCode.Alpha1);
            Assert.That(Read<bool>(_presenter, "_waitingForChoice"), Is.False);
            AssertClosed(); // The chosen option leads to the end node, which completes the flow.
        }

        [Test]
        public void FirstSubmitCompletesTypingAndSecondSubmitAdvances()
        {
            Set(_presenter, "charactersPerSecond", 48f);
            Start();
            Assert.That(Read<bool>(_presenter, "_isTyping"), Is.True);
            Submit();
            Assert.That(Read<bool>(_presenter, "_isTyping"), Is.False);
            Assert.That(Read<bool>(_presenter, "_waitingForAdvance"), Is.True);
            Submit();
            Assert.That(Read<bool>(_presenter, "_waitingForAdvance"), Is.False);
        }

        [TestCase(false)]
        [TestCase(true)]
        public void EscapeLeavesLinesAndChoicesOpen(bool choice)
        {
            Start(choice);
            SetKey(KeyCode.Escape);
            AssertDialogueWaiting(choice);
        }

        [Test]
        public void StoppingAnActiveRunnerClearsItsContextAndAllowsAnotherDialogue()
        {
            Start();
            _runner.StopDialogue();
            AssertClosed();
            Start();
            AssertDialogueWaiting(false);
        }

        [Test]
        public void ScreenTeardownStopsTheRunnerAndReleasesPauses()
        {
            Start();
            _gui.CloseAll();
            AssertClosed();
        }

        [Test]
        public void CoveredDialogueDoesNotConsumeAnotherScreensCancel()
        {
            Start();
            var screen = Game.Add<PauseTestScreen>(Game.Root);
            screen.Open(_character);
            SetKey(KeyCode.Escape);
            Assert.That(_runner.IsDialogueActive, Is.True);
            screen.Close();
            SetKey(KeyCode.Escape);
            AssertDialogueWaiting(false);
            Submit(); // Advancing the only line reaches the end node and completes the flow.
            AssertClosed();
        }

        [Test]
        public void NaturalCompletionAndReopeningDoNotReenterFinishOrLeakInput()
        {
            Start();
            Submit(); // Advancing the only line reaches the end node and completes the flow.
            AssertClosed();
            Start();
            Submit(); // Advancing the only line reaches the end node and completes the flow.
            AssertClosed();
        }

        private void AssertDialogueWaiting(bool choice)
        {
            Assert.That(_runner.IsDialogueActive, Is.True);
            Assert.That(Read<bool>(_presenter, choice ? "_waitingForChoice" : "_waitingForAdvance"), Is.True);
            Assert.That(Game.Get<UrGUIManager>().IsGameClockPaused, Is.True);
            Assert.That(Game.Get<UrGUIManager>().IsCharacterPaused(_character), Is.True);
            Assert.That(_input.PlayerControls.enabled, Is.False);
            Assert.That(Overlay.style.display.value, Is.EqualTo(DisplayStyle.Flex));
        }

        private void AssertClosed()
        {
            Assert.That(_runner.IsDialogueActive, Is.False);
            Assert.That(_runner.ActiveContext, Is.Null);
            Assert.That(Game.Get<UrGUIManager>().HasOpenScreens, Is.False);
            Assert.That(Game.Get<UrGUIManager>().IsGameClockPaused, Is.False);
            Assert.That(Game.Get<UrGUIManager>().IsCharacterPaused(_character), Is.False);
            Assert.That(_input.PlayerControls.enabled, Is.True);
            Assert.That(Overlay.style.display.value, Is.EqualTo(DisplayStyle.None));
        }

        private static T Read<T>(object owner, string field) =>
            (T)owner.GetType().GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).GetValue(owner);
    }
}

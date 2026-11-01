using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using Character;
using Core.Common.Editor;
using NUnit.Framework;
using UnityEditor;
using UnityEngine.UIElements;
using UI.Shared;
using UI.Shared.Editor;
using UnityEngine;
using UnityEngine.TestTools;

namespace Core.Dialogue.Vulcanus.Editor
{
    /// <summary>Exercises dialogue input through the authored UI map, including closing and restoring gameplay controls.</summary>
    public sealed class DialogueInputTests
    {
        private GameTestFixture _fixture;
        private Input.InputManager _input;
        private UrGUIManager _gui;
        private MainCharacter _character;
        private VulcanusDialogueRunner _runner;
        private VulcanusDialogueDatabase _database;
        private VulcanusDialogueUIDocumentPresenter _presenter;
        private UIDocument _document;
        private readonly List<UnityEngine.Camera> _sceneMainCameras = new();
        private VisualElement Overlay => _document.rootVisualElement.Q("dialogue-overlay");

        [SetUp]
        public void SetUp()
        {
            Assert.That(VulcanusDialogueRunner.Instance, Is.Null);
            _fixture = new GameTestFixture("Dialogue input");
            _fixture.Root.SetActive(true);
            _input = UIScreenPauseTests.CreateScreenServices(_fixture);
            _gui = _fixture.AddSingleton<UrGUIManager>(gui => gui.gameObject.SetActive(true));
            _character = _fixture.CreateCharacter();
            CharacterManager.Instance.RegisterMainCharacter(_character);
            foreach (var sceneCamera in UnityEngine.Object.FindObjectsByType<UnityEngine.Camera>(FindObjectsSortMode.None))
            {
                if (!sceneCamera.CompareTag("MainCamera")) continue;
                _sceneMainCameras.Add(sceneCamera);
                sceneCamera.tag = "Untagged";
            }
            var cameraRoot = new GameObject("Dialogue camera");
            cameraRoot.transform.SetParent(_fixture.Root.transform);
            cameraRoot.tag = "MainCamera";
            var camera = cameraRoot.AddComponent<UnityEngine.Camera>();
            camera.orthographic = true;
            camera.orthographicSize = 5f;
            camera.transform.position = new Vector3(0f, 0f, -10f);
            _fixture.AddSingleton<DataManager>();
            var root = new GameObject("Dialogue");
            root.SetActive(false);
            root.transform.SetParent(_fixture.Root.transform);
            _document = root.AddComponent<UIDocument>();
            _document.panelSettings = _fixture.Own(UnityEngine.Object.Instantiate(
                AssetDatabase.LoadAssetAtPath<PanelSettings>("Assets/UI/InventoryScreen/InventoryPanelSettings.asset")));
            var layout = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/UI/Dialogue/Vulcanus/VulcanusDialogueRuntime.uxml");
            _document.visualTreeAsset = layout;
            _presenter = root.AddComponent<VulcanusDialogueUIDocumentPresenter>();
            Set(_presenter, "document", _document);
            Set(_presenter, "layoutAsset", layout);
            Set(_presenter, "styleSheet", AssetDatabase.LoadAssetAtPath<StyleSheet>("Assets/UI/Dialogue/Vulcanus/VulcanusDialogueRuntime.uss"));
            Set(_presenter, "charactersPerSecond", 0f);
            root.SetActive(true);
            GameTestFixture.Invoke(_presenter, "OnEnable");
            _runner = root.AddComponent<VulcanusDialogueRunner>();
            _database = _fixture.Own(ScriptableObject.CreateInstance<VulcanusDialogueDatabase>());
            _database.Configure(null, Array.Empty<VulcanusDialogueAsset>());
            Set(_runner, "database", _database);
            Set(_runner, "presenter", _presenter);
            GameTestFixture.Invoke(_runner, "Awake");
        }

        [TearDown]
        public void TearDown()
        {
            if (_runner)
            {
                GameTestFixture.Invoke(_runner, "OnDisable");
                GameTestFixture.Invoke(_runner, "OnDestroy");
            }
            _fixture.Dispose();
            foreach (var sceneCamera in _sceneMainCameras)
                sceneCamera.tag = "MainCamera";
            _sceneMainCameras.Clear();

        }

        private void Start(bool choice = false, string speaker = "")
        {
            var dialogue = _fixture.Own(ScriptableObject.CreateInstance<VulcanusDialogueAsset>());
            VulcanusDialogueNode entry = choice
                ? new VulcanusDialogueChoiceNode("entry", new[] { new VulcanusDialogueChoiceOption("yes", "Yes", "", "", "end") })
                : new VulcanusDialogueLineNode("entry", speaker, "", "A line of dialogue.", "", "end");
            dialogue.Configure(null, 1, "test:dialogue", "Test", "", false, "", "entry", Array.Empty<string>(), "", "",
                new[] { entry, new VulcanusDialogueEndNode("end") }, Array.Empty<VulcanusDialogueAsset.ImportedMessage>(), Array.Empty<string>());
            _database.Configure(null, new[] { dialogue });
            Assert.That(_runner.StartDialogue(dialogue.DialogueId, _character), Is.True);
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
            GameTestFixture.Invoke(_runner, "OnDisable");

            _character.transform.position = new Vector3(0f, -heroY, 0f);
            Start(choice: true);
            Assert.That(anchor.ClassListContains("is-top"), Is.EqualTo(heroY > 0f));
        }

        [UnityTest]
        public IEnumerator DialogueFillsTheViewportAndRendersAtTheSelectedEdge()
        {
            try
            {
                _character.transform.position = new Vector3(0f, 3f, 0f);
                Start();
                yield return null;
                yield return null;

                var viewport = Overlay.panel.visualTree.worldBound;
                var panel = _document.rootVisualElement.Q("dialogue-panel");
                Assert.That(Overlay.worldBound.height, Is.EqualTo(viewport.height).Within(1f));
                Assert.That(panel.parent.worldBound.yMax, Is.EqualTo(viewport.yMax - 24f).Within(1f),
                    "Bottom placement must move the rendered box, not just set its class.");
                GameTestFixture.Invoke(_runner, "OnDisable");

                _character.transform.position = new Vector3(0f, -3f, 0f);
                Start(choice: true);
                yield return null;
                yield return null;
                Assert.That(panel.worldBound.yMin, Is.EqualTo(viewport.yMin + 24f).Within(1f));
            }
            finally
            {
                GameTestFixture.Invoke(_runner, "OnDisable");
            }
        }

        [TestCase("base:villager")]
        [TestCase("")]
        public void TypewriterSpeakerUsesOnlyTheActiveVulcanusLine(string speaker)
        {
            Start(speaker: speaker);
            Assert.That(Interaction.Dialog.TypewriterSoundResolver.ResolveCurrentSpeakerId(),
                Is.EqualTo(string.IsNullOrWhiteSpace(speaker) ? null : speaker));
            GameTestFixture.Invoke(_runner, "OnDisable");
            Assert.That(Interaction.Dialog.TypewriterSoundResolver.ResolveCurrentSpeakerId(), Is.Null);
        }

        private void SetKey(KeyCode key)
        {
            using var evt = KeyDownEvent.GetPooled('\0', key, EventModifiers.None);
            evt.target = Overlay;
            Overlay.SendEvent(evt);
        }

        [TestCase("database", "requires its database")]
        [TestCase("presenter", "requires its presenter")]
        [TestCase("maxStepsPerRun", "must be positive")]
        public void InvalidSetupFailsInAwake(string invalidField, string message)
        {
            var owner = new GameObject("Invalid dialogue setup");
            owner.SetActive(false);
            owner.transform.SetParent(_fixture.Root.transform);
            var runner = owner.AddComponent<VulcanusDialogueRunner>();
            Set(runner, "database", _database);
            Set(runner, "presenter", _presenter);
            Set(runner, invalidField, invalidField == "maxStepsPerRun" ? 0 : null);
            Assert.That(() => GameTestFixture.Invoke(runner, "Awake"),
                Throws.TypeOf<InvalidOperationException>().With.Message.Contains(message));
            Assert.That(VulcanusDialogueRunner.Instance, Is.SameAs(_runner));
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
            Assert.That(Read<VulcanusDialogueChoiceOption>(_presenter, "_selectedOption"), Is.Not.Null);
        }

        [Test]
        public void FirstSubmitCompletesTypingAndSecondSubmitAdvances()
        {
            Set(_presenter, "charactersPerSecond", 48f);
            Start();
            _runner.StopAllCoroutines(); // EditMode drives the presenter iterator explicitly instead of advancing real frames.
            var node = (VulcanusDialogueLineNode)_runner.ActiveContext.CurrentNode;
            var line = _presenter.PresentLine(node, node.Text, _runner.ActiveContext);
            Assert.That(line.MoveNext(), Is.True);
            Assert.That(Read<bool>(_presenter, "_isTyping"), Is.True);
            Submit();
            Assert.That(line.MoveNext(), Is.True);
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
        public void RuntimeDialogueStateIsExcludedFromUnityReloadSerialization()
        {
            foreach (var name in new[] { "_activeContext", "_activeDialogueRoutine", "_onCompleted" })
                Assert.That(typeof(VulcanusDialogueRunner).GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)
                    .IsDefined(typeof(NonSerializedAttribute), false), Is.True, name);
        }

        [Test]
        public void DisablingAnActiveRunnerClearsItsContextAndAllowsAnotherDialogue()
        {
            Start();
            GameTestFixture.Invoke(_runner, "OnDisable");
            AssertClosed();
            Assert.That(Read<Coroutine>(_runner, "_activeDialogueRoutine"), Is.Null);
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
            var screen = _fixture.Root.AddComponent<PauseTestScreen>();
            screen.Open(_character);
            SetKey(KeyCode.Escape);
            Assert.That(_runner.IsDialogueActive, Is.True);
            screen.Close();
            SetKey(KeyCode.Escape);
            AssertDialogueWaiting(false);
            GameTestFixture.Invoke(_runner, "FinishDialogue");
            AssertClosed();
        }

        [Test]
        public void NaturalCompletionAndReopeningDoNotReenterFinishOrLeakInput()
        {
            Start();
            GameTestFixture.Invoke(_runner, "FinishDialogue");
            AssertClosed();
            Start();
            GameTestFixture.Invoke(_runner, "FinishDialogue");
            AssertClosed();
        }

        private void AssertDialogueWaiting(bool choice)
        {
            Assert.That(_runner.IsDialogueActive, Is.True);
            Assert.That(Read<bool>(_presenter, choice ? "_waitingForChoice" : "_waitingForAdvance"), Is.True);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.True);
            Assert.That(UrGUIManager.IsCharacterPaused(_character), Is.True);
            Assert.That(_input.PlayerControls.enabled, Is.False);
            Assert.That(Overlay.style.display.value, Is.EqualTo(DisplayStyle.Flex));
        }

        private void AssertClosed()
        {
            Assert.That(_runner.IsDialogueActive, Is.False);
            Assert.That(_runner.ActiveContext, Is.Null);
            Assert.That(UrGUIManager.HasOpenScreens, Is.False);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
            Assert.That(UrGUIManager.IsCharacterPaused(_character), Is.False);
            Assert.That(_input.PlayerControls.enabled, Is.True);
            Assert.That(Overlay.style.display.value, Is.EqualTo(DisplayStyle.None));
        }

        private static T Read<T>(object owner, string field) =>
            (T)owner.GetType().GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).GetValue(owner);
        private static void Set(object owner, string field, object value) =>
            owner.GetType().GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(owner, value);
    }
}

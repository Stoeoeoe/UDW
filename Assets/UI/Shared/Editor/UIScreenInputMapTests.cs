using System;
using Core.Location;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;
using Object = UnityEngine.Object;

namespace UI.Shared.Editor
{
    [Category("UIScreen")]
    public sealed class UIScreenInputMapTests
    {
        private GameObject _root;
        private Input.InputManager _input;
        private UrGUIManager _manager;
        private PauseTestScreen _first, _second;

        [SetUp]
        public void SetUp()
        {
            _root = new GameObject("Screen input maps");
            _input = UIScreenPauseTests.CreateScreenServices(_root);
            _input.Actions.AddActionMap("Inspection").AddAction("Inspect", InputActionType.Button);
            _manager = _root.AddComponent<UrGUIManager>();
            UIScreenPauseTests.Invoke(_manager, "Awake");
            UIScreenPauseTests.Invoke(_manager, "OnEnable");
            _first = _root.AddComponent<PauseTestScreen>();
            _second = _root.AddComponent<PauseTestScreen>();
            _first.PauseWhileOpen = _second.PauseWhileOpen = ScreenPauseMode.None;
        }

        [TearDown]
        public void TearDown()
        {
            _manager.CloseAll();
            UIScreenPauseTests.Invoke(_manager, "OnDisable");
            UIScreenPauseTests.Invoke(_manager, "OnDestroy");
            UIScreenPauseTests.ReleaseScreenServices(_root);
            Object.DestroyImmediate(_root);
        }

        [Test]
        public void ScreensUseThePlayerInputAssetAndRestoreTheUnderlyingMap()
        {
            var player = _input.GetComponent<PlayerInput>();
            Assert.That(_input.Actions, Is.SameAs(player.actions));
            Assert.That(_input.PlayerControls.enabled, Is.True);
            _first.Open(null);
            Assert.That(player.currentActionMap.name, Is.EqualTo("UI"));
            Assert.That(_input.PlayerControls.enabled, Is.False);
            Assert.That(_input.Actions.FindAction("Global/OpenInventory").enabled, Is.True);
            _second.InputActionMap = "Inspection";
            _second.Open(null);
            Assert.That(player.currentActionMap.name, Is.EqualTo("Inspection"));
            Assert.That(_input.Actions.FindActionMap("UI").enabled, Is.True);
            _second.Close();
            Assert.That(player.currentActionMap.name, Is.EqualTo("UI"));
            Assert.That(_input.Actions.FindActionMap("Inspection").enabled, Is.False);
            _first.Close();
            Assert.That(player.currentActionMap.name, Is.EqualTo("PlayerControls"));
        }

        [Test]
        public void ClosingAnUnderlyingScreenDoesNotRestoreGameplayInput()
        {
            _first.Open(null);
            _second.InputActionMap = "Inspection";
            _second.Open(null);
            _first.Close();
            Assert.That(_input.ActiveMapName, Is.EqualTo("Inspection"));
            Assert.That(_input.PlayerControls.enabled, Is.False);
            _manager.CloseAll();
            Assert.That(_input.PlayerControls.enabled, Is.True);
        }

        [Test]
        public void LocationInputGateSurvivesScreenChangesAndRestoresTheSelectedMap()
        {
            _input.OnLocationLeave(null);
            _first.Open(null);
            Assert.That(_input.Actions.enabled, Is.False);
            _input.OnLocationEnter(null);
            Assert.That(_input.ActiveMapName, Is.EqualTo("UI"));
            Assert.That(_input.PlayerControls.enabled, Is.False);
            _input.DisableInput();
            _first.Close();
            Assert.That(_input.Actions.enabled, Is.False);
            _input.EnableInput();
            Assert.That(_input.PlayerControls.enabled, Is.True);
        }

        [TestCase("Missing")]
        [TestCase("PlayerControls")]
        [TestCase("Global")]
        public void InvalidScreenMapsFailBeforeOpeningOrChangingInput(string map)
        {
            _first.InputActionMap = map;
            Assert.Throws<ArgumentException>(() => _first.Open(null));
            Assert.That(UrGUIManager.HasOpenScreens, Is.False);
            Assert.That(_first.Visible, Is.False);
            Assert.That(_input.PlayerControls.enabled, Is.True);
        }

        [Test]
        public void OnlyTheTopRootIsInteractiveAndRebindingKeepsItsPriority()
        {
            var firstRoot = new VisualElement();
            var secondRoot = new VisualElement();
            _first.OpenElement(firstRoot);
            _second.OpenElement(secondRoot);
            Assert.That(firstRoot.enabledSelf, Is.False);
            Assert.That(secondRoot.enabledSelf, Is.True);
            var replacement = new VisualElement();
            _first.Rebind(replacement);
            Assert.That(firstRoot.enabledSelf, Is.True, "Detached trees recover their original enabled state.");
            Assert.That(replacement.enabledSelf, Is.False);
            Assert.That(_manager.IsTopScreen(_second), Is.True);
            _second.Close();
            Assert.That(replacement.enabledSelf, Is.True);
        }
    }
}

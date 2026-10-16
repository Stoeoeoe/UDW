using System;
using Core.Location;
using Core.TimeAndWeather;
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
        private Core.Common.Editor.GameTestFixture _fixture;
        private Input.InputManager _input;
        private UrGUIManager _manager;
        private PauseTestScreen _first, _second;

        [SetUp]
        public void SetUp()
        {
            _fixture = new Core.Common.Editor.GameTestFixture("Screen input maps");
            _root = _fixture.Root;
            _root.SetActive(true);
            _input = UIScreenPauseTests.CreateScreenServices(_fixture,
                actions => actions.AddActionMap("Inspection").AddAction("Inspect", InputActionType.Button));
            _manager = _fixture.AddSingleton<UrGUIManager>(manager => manager.gameObject.SetActive(true));
            _first = _root.AddComponent<PauseTestScreen>();
            _second = _root.AddComponent<PauseTestScreen>();
            _first.PauseWhileOpen = _second.PauseWhileOpen = ScreenPauseMode.None;
        }

        [TearDown]
        public void TearDown()
        {
            _manager?.CloseAll();
            _fixture?.Dispose();
        }

        [Test]
        public void KeyboardMovementResolvesWithTheAuthoredControlSchemeAfterClosingAMenu()
        {
            var keyboard = InputSystem.AddDevice<Keyboard>();
            try
            {
                _input.Actions.devices = new InputDevice[] { keyboard };
                var scheme = _input.Actions.FindControlScheme("Keyboard&Mouse").Value;
                _input.Actions.bindingMask = InputBinding.MaskByGroup(scheme.bindingGroup);
                var move = _input.PlayerControls.FindAction("PrimaryMovement", true);
                Assert.That(move.controls.Count, Is.GreaterThan(0), "The active control scheme must resolve WASD bindings.");

                _first.Open(null);
                _first.Close();
                Assert.That(move.enabled, Is.True);
                Assert.That(move.controls, Does.Contain(keyboard.dKey));
            }
            finally
            {
                InputSystem.RemoveDevice(keyboard);
            }
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
            _input.OnLocationLeave(null);
            _first.Close();
            Assert.That(_input.Actions.enabled, Is.False);
            _input.OnLocationEnter(null);
            Assert.That(_input.PlayerControls.enabled, Is.True);
        }

        [TestCase(false)]
        [TestCase(true)]
        public void OverlappingContextsStayBlockedUntilBothEnd(bool endDayFirst)
        {
            _input.OnLocationLeave(null);
            _input.OnLocationLeave(null);
            _input.OnEvent(new DayTransitionStarted(null));
            _input.OnEvent(new DayTransitionStarted(null));
            Assert.That(_input.Actions.enabled, Is.False);

            if (endDayFirst) _input.OnEvent(new DayTransitionFinished(null));
            else _input.OnLocationEnter(null);
            Assert.That(_input.Actions.enabled, Is.False);

            if (endDayFirst) _input.OnLocationEnter(null);
            else _input.OnEvent(new DayTransitionFinished(null));
            Assert.That(_input.PlayerControls.enabled, Is.True);
            Assert.That(_input.Actions.FindActionMap("UI").enabled, Is.True);
            Assert.That(_input.Actions.FindActionMap("Global").enabled, Is.True);
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

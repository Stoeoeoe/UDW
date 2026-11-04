using System;
using System.Collections.Generic;
using System.Reflection;
using System.Threading;
using Character;
using Character.Abilities;
using Core.Common.Editor;
using Core.Context;
using Core.Location;
using Core.TimeAndWeather;
using Input;
using Interaction;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;
using Object = UnityEngine.Object;
using static Core.Common.Editor.Reflect;
using InteractionMode = Core.Context.InteractionMode;

namespace UI.Shared.Editor
{
    public sealed class MenuBlockingTestAction : AbstractAction
    {
        public override bool HasPreparationPhase => true;
        public bool Executed;
        public override Awaitable OnExecute(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            Executed = true;
            return Completed();
        }
        public override void Interrupt(PlayerInteractionContextSnapshot snapshot) { }
    }

    public sealed class PauseTestScreen : ManagedUIScreen
    {
        public bool Visible { get; private set; }
        public bool Open(GameCharacter character, ScreenPauseMode? mode = null) =>
            OpenScreen(() => Visible = true, () => Visible = false, character, mode);
        public void Close() => CloseScreen();
        public bool OpenElement(VisualElement overlay, GameCharacter character = null, ScreenPauseMode? mode = null)
        {
            RebindRoot(overlay);
            return OpenScreen(character, mode ?? ScreenPauseMode.None);
        }
        public void Rebind(VisualElement overlay) => RebindRoot(overlay);
        public int CloseCount { get; private set; }
        protected override void OnScreenClosed() => CloseCount++;
    }

    [Category("UIScreen")]
    public sealed class UIScreenPauseTests : GameTest
    {
        private GameObject _root;

        private UrGUIManager _manager;
        private PauseTestScreen _first;
        private PauseTestScreen _second;
        private GameCharacter _character;
        private float _timeScale;
        private float _fixedDeltaTime, _maximumDeltaTime;

        [SetUp]
        public void SetUp()
        {

            _timeScale = Time.timeScale;
            _fixedDeltaTime = Time.fixedDeltaTime;
            _maximumDeltaTime = Time.maximumDeltaTime;

            _root = Game.Root;
            _root.SetActive(true);
            CreateScreenServices(Game);
            _manager = Game.Start<UrGUIManager>(manager => manager.gameObject.SetActive(true));
            _first = Game.Add<PauseTestScreen>(_root);
            _second = Game.Add<PauseTestScreen>(_root);
            _character = Game.CreateCharacter();
        }

        [TearDown]
        public void TearDown()
        {
            _manager?.CloseAll();

            Time.timeScale = _timeScale;
            Time.maximumDeltaTime = _maximumDeltaTime;
            Time.fixedDeltaTime = _fixedDeltaTime;
        }

        private MainCharacter CreateMainCharacter(string name) => Game.CreateCharacter(name);

        [Test]
        public void MainCharacterDeathClosesAllScreensWithoutChangingTheDeadCondition()
        {
            var main = CreateMainCharacter("Main character");
            Game.Get<CharacterManager>().RegisterMainCharacter(main);
            _first.Open(main);
            _second.Open(main);
            main.SetConditionState(ConditionState.Dead);
            Assert.That(_first.Visible || _second.Visible, Is.False);
            Assert.That(_first.CloseCount, Is.EqualTo(1));
            Assert.That(_second.CloseCount, Is.EqualTo(1));
            Assert.That(Game.Get<UrGUIManager>().HasOpenScreens, Is.False);
            Assert.That(Game.Get<UrGUIManager>().IsGameClockPaused, Is.False);
            Assert.That(Game.Get<UrGUIManager>().IsCharacterPaused(main), Is.False);
            Assert.That(main.ConditionState, Is.EqualTo(ConditionState.Dead));
            Assert.That(Game.Get<InputManager>().ActiveMapName, Is.EqualTo("PlayerControls"));
        }

        [Test]
        public void DeathOfAnNpcOrPreviousMainCharacterDoesNotCloseCurrentMenus()
        {
            var previous = CreateMainCharacter("Previous main");
            var current = CreateMainCharacter("Current main");
            Game.Get<CharacterManager>().RegisterMainCharacter(previous);
            Game.Get<CharacterManager>().RegisterMainCharacter(current);
            _first.Open(current);
            previous.SetConditionState(ConditionState.Dead);
            _character.SetConditionState(ConditionState.Dead);
            Assert.That(_first.Visible, Is.True);
            current.SetConditionState(ConditionState.Dead);
            Assert.That(_first.Visible, Is.False);
        }

        [Test]
        public void ReenablingTheManagerRestoresTheCurrentCharacterSubscriptionOnce()
        {
            var main = CreateMainCharacter("Main character");
            Game.Get<CharacterManager>().RegisterMainCharacter(main);
            Invoke(_manager, "OnDisable");
            var conditionEvent = typeof(GameCharacter).GetField("OnConditionStateChanged",
                BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(conditionEvent.GetValue(main), Is.Null);
            Invoke(_manager, "OnEnable");
            var listeners = (Delegate)conditionEvent.GetValue(main);
            Assert.That(listeners.GetInvocationList(), Has.Length.EqualTo(1));
            _first.Open(main);
            main.SetConditionState(ConditionState.Dead);
            Assert.That(_first.CloseCount, Is.EqualTo(1));
        }

        [Test]
        public void ClosingANeverOpenedOrAlreadyClosedScreenDoesNotRaiseTheCloseHook()
        {
            _first.Close();
            Assert.That(_first.CloseCount, Is.Zero);
            _first.Open(_character);
            _first.Close();
            _first.Close();
            Invoke(_first, "OnDisable");
            Assert.That(_first.CloseCount, Is.EqualTo(1));
        }

        [Test]
        public void ExplicitRebindingPreservesPauseAndCloseHidesTheReplacementRoot()
        {
            var original = new VisualElement();
            var replacement = new VisualElement();
            _first.OpenElement(original, _character, ScreenPauseMode.CharacterAndClock);
            _second.Open(_character, ScreenPauseMode.None);
            _first.Rebind(replacement);
            Assert.That(_manager.IsTopScreen(_second), Is.True);
            Assert.That(_character.IsControlBlocked, Is.True);
            Assert.That(Game.Get<UrGUIManager>().IsGameClockPaused, Is.True);
            Assert.That(original.style.display.value, Is.EqualTo(DisplayStyle.None));
            Assert.That(replacement.style.display.value, Is.EqualTo(DisplayStyle.Flex));
            Assert.That(replacement.enabledSelf, Is.False);
            _second.Close();
            _first.Close();
            Assert.That(replacement.style.display.value, Is.EqualTo(DisplayStyle.None));
            Assert.That(_first.CloseCount, Is.EqualTo(1));
            Assert.That(_character.IsControlBlocked, Is.False);
        }

        [TestCase(ScreenPauseMode.None, false, false)]
        [TestCase(ScreenPauseMode.Character, true, false)]
        [TestCase(ScreenPauseMode.GameClock, false, true)]
        [TestCase(ScreenPauseMode.CharacterAndClock, true, true)]
        public void CharacterAndClockCanBePausedIndependently(ScreenPauseMode mode, bool characterPaused, bool clockPaused)
        {
            _first.PauseWhileOpen = mode;
            Assert.That(_first.Open(_character), Is.True);
            Assert.That(_first.Visible, Is.True);
            Assert.That(_character.IsControlBlocked, Is.EqualTo(characterPaused));
            Assert.That(Game.Get<UrGUIManager>().IsGameClockPaused, Is.EqualTo(clockPaused));
            Assert.That(Time.timeScale, Is.EqualTo(_timeScale), "Screen pauses must preserve gameplay time-scale requests.");
            _first.Close();
            Assert.That(_first.Visible, Is.False);
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(Game.Get<UrGUIManager>().IsGameClockPaused, Is.False);
        }

        [TestCase(true)]
        [TestCase(false)]
        public void OverlappingScreensKeepTheirPauseUntilTheLastOwnerCloses(bool closeFirst)
        {
            _first.Open(_character);
            _second.Open(_character);
            (closeFirst ? _first : _second).Close();
            Assert.That(_character.IsControlBlocked, Is.True);
            Assert.That(Game.Get<UrGUIManager>().IsGameClockPaused, Is.True);
            (closeFirst ? _second : _first).Close();
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(Game.Get<UrGUIManager>().IsGameClockPaused, Is.False);
        }

        [Test]
        public void AVisibleNonPausingScreenDoesNotKeepTheClockPaused()
        {
            _first.Open(_character);
            _second.Open(_character, ScreenPauseMode.None);
            _first.Close();
            Assert.That(Game.Get<UrGUIManager>().HasOpenScreens, Is.True);
            Assert.That(Game.Get<UrGUIManager>().IsGameClockPaused, Is.False);
            Assert.That(_character.IsControlBlocked, Is.False);
        }

        [Test]
        public void ReopeningOneScreenUpdatesItsRequestWithoutLeakingAnOwner()
        {
            _first.Open(_character);
            _first.Open(_character);
            _first.Open(_character, ScreenPauseMode.Character);
            Assert.That(Game.Get<UrGUIManager>().IsGameClockPaused, Is.False);
            Assert.That(_character.IsControlBlocked, Is.True);
            _first.Close();
            _first.Close();
            Assert.That(_character.IsControlBlocked, Is.False);
        }

        [Test]
        public void ClosingAScreenPreservesAnExistingOrLaterGameplayFreeze()
        {
            SetCondition(ConditionState.Frozen);
            _first.Open(_character);
            _first.Close();
            Assert.That(_character.IsControlBlocked, Is.True);
            _character.SetConditionState(ConditionState.Normal);
            _first.Open(_character);
            SetCondition(ConditionState.Frozen);
            _first.Close();
            Assert.That(_character.IsControlBlocked, Is.True);
        }

        [Test]
        public void GameplayUnfreezeCannotReleaseAnOpenScreensPause()
        {
            _first.Open(_character);
            _character.SetConditionState(ConditionState.Normal);
            Assert.That(_character.IsControlBlocked, Is.True);
            _first.Close();
            Assert.That(_character.IsControlBlocked, Is.False);
        }

        [Test]
        public void UpdatingTheTargetReleasesOnlyTheOldCharacter()
        {
            var other = Game.CreateCharacter("Other character");
            _first.Open(_character);
            _first.Open(other);
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(other.IsControlBlocked, Is.True);
            _first.Close();
            Assert.That(other.IsControlBlocked, Is.False);
        }

        [Test]
        public void DisablingTheScreenReleasesItsRequests()
        {
            _first.Open(_character);
            Call(_first, "OnDisable");
            Assert.That(_first.Visible, Is.False);
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(Game.Get<UrGUIManager>().IsGameClockPaused, Is.False);
        }

        [TestCase(false)]
        [TestCase(true)]
        public void ManagerDisableAndLocationLeaveCloseAllScreens(bool leavingLocation)
        {
            _first.Open(_character);
            _second.Open(_character);
            if (leavingLocation) _manager.OnLocationLeave(null);
            else Invoke(_manager, "OnDisable");
            Assert.That(_first.Visible || _second.Visible, Is.False);
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(Game.Get<UrGUIManager>().HasOpenScreens, Is.False);
            Assert.That(Game.Get<UrGUIManager>().IsGameClockPaused, Is.False);
        }

        [Test]
        public void FailedPresentationReleasesThePause()
        {
            Assert.Throws<InvalidOperationException>(() => _manager.Open(_first,
                () => throw new InvalidOperationException("Failed presentation"), () => { },
                ScreenPauseMode.CharacterAndClock, _character));
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(Game.Get<UrGUIManager>().IsGameClockPaused, Is.False);
        }

        [Test]
        public void PausingStopsVelocityImmediatelyAndMovementCannotRestartIt()
        {
            var controller = _character.gameObject.AddComponent<Controller2D>();
            var body = _character.GetComponent<Rigidbody2D>();
            Set(controller, "_rb", body);
            typeof(GameCharacter).GetField("<Controller>k__BackingField", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_character, controller);
            body.linearVelocity = Vector2.right * 4;
            _first.Open(_character, ScreenPauseMode.Character);
            Assert.That(body.linearVelocity, Is.EqualTo(Vector2.zero));
            var movement = Game.Add<MovementAbility>(_character.gameObject);
            Set(movement, "Character", _character);
            body.linearVelocity = Vector2.right;
            movement.Tick();
            Assert.That(body.linearVelocity, Is.EqualTo(Vector2.zero));
        }

        private void SetCondition(ConditionState condition) => typeof(GameCharacter)
            .GetField("<ConditionState>k__BackingField", BindingFlags.Instance | BindingFlags.NonPublic)
            .SetValue(_character, condition);

        [Test]
        public void NonPausingMenusBlockWorldContextImmediatelyUntilTheLastScreenCloses()
        {

            var context = Game.Get<PlayerInteractionContext>();
            _first.Open(_character, ScreenPauseMode.None);
            _second.Open(_character, ScreenPauseMode.None);
            Assert.That(context.CurrentSnapshot.WorldInteractionBlocked, Is.True);
            Assert.That(context.CurrentSnapshot.CanInteractWithWorld, Is.False);
            Assert.That(context.CurrentSnapshot.Mode, Is.EqualTo(InteractionMode.None));
            _first.Close();
            Assert.That(context.CurrentSnapshot.WorldInteractionBlocked, Is.True);
            _second.Close();
            Assert.That(context.CurrentSnapshot.WorldInteractionBlocked, Is.False);
        }

        [Test]
        public void OpeningAMenuDuringPreparationPreventsExecutionAndReleasesTheActionFreeze()
        {
            var controller = _character.gameObject.AddComponent<Controller2D>();
            Set(controller, "_rb", _character.GetComponent<Rigidbody2D>());
            typeof(GameCharacter).GetField("<Controller>k__BackingField", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_character, controller);
            var snapshot = PlayerInteractionContextSnapshot.Empty() with { SceneReady = true, Character = _character };
            var action = _character.gameObject.AddComponent<MenuBlockingTestAction>();
            var executor = new ActionExecutor(_character, () => snapshot);
            var run = executor.RunAsync(action);
            Assert.That(executor.State, Is.EqualTo(ActionExecutionState.Preparing));
            Assert.That(_character.IsControlBlocked, Is.True);
            snapshot = snapshot with { WorldInteractionBlocked = true };
            executor.ContinueFromPrepare();
            run.GetAwaiter().GetResult();
            Assert.That(action.Executed, Is.False);
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(executor.IsIdle, Is.True);
        }

        [Test]
        public void TheCalendarResumesWhileANonPausingScreenRemainsOpen()
        {

            var clock = Game.Clock;
            clock.Start();
            var step = Game.Get<ClockSettings>().secondsPerInGameMinute;
            Game.State.Time.hour = 6;
            Game.State.Time.minute = 0;
            Game.State.Time.secondsTowardNextMinute = step;
            _first.Open(_character, ScreenPauseMode.GameClock);
            _second.Open(_character, ScreenPauseMode.None);
            clock.Advance(0f);
            Assert.That(Game.State.Time.minute, Is.Zero);
            Assert.That(Game.State.Time.secondsTowardNextMinute, Is.EqualTo(step));
            _first.Close();
            clock.Advance(0f);
            Assert.That(Game.State.Time.minute, Is.GreaterThan(0));
            Assert.That(_second.Visible, Is.True);

        }

        [Test]
        public void LocationRegistrationFollowsManagerEnableAndDisable()
        {
            var level = Game.Get<LevelManager>();
            var listeners = (List<ILocationLifecycle>)typeof(LevelManager)
                .GetField("_lifecycleComponents", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(level);
            Assert.That(listeners, Contains.Item(_manager));
            Invoke(_manager, "OnEnable");
            Assert.That(listeners.FindAll(listener => ReferenceEquals(listener, _manager)).Count, Is.EqualTo(1));
            Invoke(_manager, "OnDisable");
            Assert.That(listeners, Has.No.Member(_manager));
            Invoke(_manager, "OnEnable");
            Assert.That(listeners, Contains.Item(_manager));
        }

        internal static InputManager CreateScreenServices(GameTestFixture fixture,
            Action<InputActionAsset> configureActions = null)
        {
            return fixture.Start<InputManager>(input =>
            {
                var player = input.GetComponent<PlayerInput>();
                var authored = AssetDatabase.LoadAssetAtPath<InputActionAsset>(
                    "Assets/InputSystem_Actions.inputactions");
                player.actions = fixture.Own(fixture.InjectObject(Object.Instantiate(authored)));
                configureActions?.Invoke(player.actions);
                player.defaultActionMap = "PlayerControls";
                input.gameObject.SetActive(true);
            });
        }

        internal static void Invoke(object target, string method) => GameTestFixture.Invoke(target, method);
    }
}

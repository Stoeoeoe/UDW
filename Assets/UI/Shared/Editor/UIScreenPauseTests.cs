using System;
using System.Reflection;
using Character;
using Core.Context;
using Interaction;
using System.Collections;
using Core.Game;
using Core.Location;
using Core.TimeAndWeather;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace UI.Shared.Editor
{
    public sealed class MenuBlockingTestAction : AbstractAction
    {
        public override bool HasPreparationPhase => true;
        public bool Executed;
        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            Executed = true;
            yield break;
        }
        public override void Interrupt(PlayerInteractionContextSnapshot snapshot) { }
    }

    public sealed class PauseTestScreen : ManagedUIScreen
    {
        public bool Visible { get; private set; }
        public bool Open(GameCharacter character, ScreenPauseMode? mode = null) =>
            OpenScreen(() => Visible = true, () => Visible = false, character, mode);
        public void Close() => CloseScreen();
        public bool OpenElement(UnityEngine.UIElements.VisualElement overlay, GameCharacter character = null, ScreenPauseMode? mode = null)
        {
            RebindRoot(overlay);
            return OpenScreen(character, mode ?? ScreenPauseMode.None);
        }
        public void Rebind(UnityEngine.UIElements.VisualElement overlay) => RebindRoot(overlay);
        public int CloseCount { get; private set; }
        protected override void OnScreenClosed() => CloseCount++;
    }

    [Category("UIScreen")]
    public sealed class UIScreenPauseTests
    {
        private GameObject _root;
        private Core.Common.Editor.GameTestFixture _fixture;
        private UrGUIManager _manager;
        private PauseTestScreen _first;
        private PauseTestScreen _second;
        private GameCharacter _character;
        private float _timeScale;
        private float _fixedDeltaTime, _maximumDeltaTime;

        [SetUp]
        public void SetUp()
        {
            Assert.That(UrGUIManager.Instance, Is.Null, "Run outside a game session.");
            _timeScale = Time.timeScale;
            _fixedDeltaTime = Time.fixedDeltaTime;
            _maximumDeltaTime = Time.maximumDeltaTime;
            _fixture = new Core.Common.Editor.GameTestFixture("Screen pause tests");
            _root = _fixture.Root;
            _root.SetActive(true);
            CreateScreenServices(_fixture);
            _manager = _fixture.AddSingleton<UrGUIManager>(manager => manager.gameObject.SetActive(true));
            _first = _root.AddComponent<PauseTestScreen>();
            _second = _root.AddComponent<PauseTestScreen>();
            _character = _fixture.CreateCharacter();
        }

        [TearDown]
        public void TearDown()
        {
            _manager?.CloseAll();
            _fixture?.Dispose();
            Time.timeScale = _timeScale;
            Time.maximumDeltaTime = _maximumDeltaTime;
            Time.fixedDeltaTime = _fixedDeltaTime;
        }

        private MainCharacter CreateMainCharacter(string name) => _fixture.CreateCharacter(name);

        [Test]
        public void MainCharacterDeathClosesAllScreensWithoutChangingTheDeadCondition()
        {
            var main = CreateMainCharacter("Main character");
            CharacterManager.Instance.RegisterMainCharacter(main);
            _first.Open(main);
            _second.Open(main);
            main.SetConditionState(ConditionState.Dead);
            Assert.That(_first.Visible || _second.Visible, Is.False);
            Assert.That(_first.CloseCount, Is.EqualTo(1));
            Assert.That(_second.CloseCount, Is.EqualTo(1));
            Assert.That(UrGUIManager.HasOpenScreens, Is.False);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
            Assert.That(UrGUIManager.IsCharacterPaused(main), Is.False);
            Assert.That(main.ConditionState, Is.EqualTo(ConditionState.Dead));
            Assert.That(Input.InputManager.Instance.ActiveMapName, Is.EqualTo("PlayerControls"));
        }

        [Test]
        public void DeathOfAnNpcOrPreviousMainCharacterDoesNotCloseCurrentMenus()
        {
            var previous = CreateMainCharacter("Previous main");
            var current = CreateMainCharacter("Current main");
            CharacterManager.Instance.RegisterMainCharacter(previous);
            CharacterManager.Instance.RegisterMainCharacter(current);
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
            CharacterManager.Instance.RegisterMainCharacter(main);
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
            var original = new UnityEngine.UIElements.VisualElement();
            var replacement = new UnityEngine.UIElements.VisualElement();
            _first.OpenElement(original, _character, ScreenPauseMode.CharacterAndClock);
            _second.Open(_character, ScreenPauseMode.None);
            _first.Rebind(replacement);
            Assert.That(_manager.IsTopScreen(_second), Is.True);
            Assert.That(_character.IsControlBlocked, Is.True);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.True);
            Assert.That(original.style.display.value, Is.EqualTo(UnityEngine.UIElements.DisplayStyle.None));
            Assert.That(replacement.style.display.value, Is.EqualTo(UnityEngine.UIElements.DisplayStyle.Flex));
            Assert.That(replacement.enabledSelf, Is.False);
            _second.Close();
            _first.Close();
            Assert.That(replacement.style.display.value, Is.EqualTo(UnityEngine.UIElements.DisplayStyle.None));
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
            Assert.That(UrGUIManager.IsGameClockPaused, Is.EqualTo(clockPaused));
            Assert.That(Time.timeScale, Is.EqualTo(_timeScale), "Screen pauses must preserve gameplay time-scale requests.");
            _first.Close();
            Assert.That(_first.Visible, Is.False);
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
        }

        [TestCase(true)]
        [TestCase(false)]
        public void OverlappingScreensKeepTheirPauseUntilTheLastOwnerCloses(bool closeFirst)
        {
            _first.Open(_character);
            _second.Open(_character);
            (closeFirst ? _first : _second).Close();
            Assert.That(_character.IsControlBlocked, Is.True);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.True);
            (closeFirst ? _second : _first).Close();
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
        }

        [Test]
        public void AVisibleNonPausingScreenDoesNotKeepTheClockPaused()
        {
            _first.Open(_character);
            _second.Open(_character, ScreenPauseMode.None);
            _first.Close();
            Assert.That(UrGUIManager.HasOpenScreens, Is.True);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
            Assert.That(_character.IsControlBlocked, Is.False);
        }

        [Test]
        public void ReopeningOneScreenUpdatesItsRequestWithoutLeakingAnOwner()
        {
            _first.Open(_character);
            _first.Open(_character);
            _first.Open(_character, ScreenPauseMode.Character);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
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
            var other = _fixture.CreateCharacter("Other character");
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
            typeof(ManagedUIScreen).GetMethod("OnDisable", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(_first, null);
            Assert.That(_first.Visible, Is.False);
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
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
            Assert.That(UrGUIManager.HasOpenScreens, Is.False);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
        }

        [Test]
        public void FailedPresentationReleasesThePause()
        {
            Assert.Throws<InvalidOperationException>(() => _manager.Open(_first,
                () => throw new InvalidOperationException("Failed presentation"), () => { },
                ScreenPauseMode.CharacterAndClock, _character));
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
        }

        [Test]
        public void PausingStopsVelocityImmediatelyAndMovementCannotRestartIt()
        {
            var controller = _character.gameObject.AddComponent<Controller2D>();
            var body = _character.GetComponent<Rigidbody2D>();
            typeof(Controller2D).GetField("_rb", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(controller, body);
            typeof(GameCharacter).GetField("<Controller>k__BackingField", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_character, controller);
            body.linearVelocity = Vector2.right * 4;
            _first.Open(_character, ScreenPauseMode.Character);
            Assert.That(body.linearVelocity, Is.EqualTo(Vector2.zero));
            var movement = _character.gameObject.AddComponent<Character.Abilities.MovementAbility>();
            typeof(Character.Abilities.CharacterAbility).GetField("Character", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(movement, _character);
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
            Assert.That(PlayerInteractionContext.Instance, Is.Null);
            var context = _fixture.AddSingleton<PlayerInteractionContext>();
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
            typeof(Controller2D).GetField("_rb", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(controller, _character.GetComponent<Rigidbody2D>());
            typeof(GameCharacter).GetField("<Controller>k__BackingField", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_character, controller);
            var snapshot = PlayerInteractionContextSnapshot.Empty() with { SceneReady = true, Character = _character };
            var action = _character.gameObject.AddComponent<MenuBlockingTestAction>();
            var executor = new ActionExecutor(_character, () => snapshot);
            var routine = executor.Run(action);
            Assert.That(routine.MoveNext(), Is.True);
            var prepare = (IEnumerator)routine.Current;
            Assert.That(prepare.MoveNext(), Is.True);
            Assert.That(executor.State, Is.EqualTo(ActionExecutionState.Preparing));
            Assert.That(_character.IsControlBlocked, Is.True);
            snapshot = snapshot with { WorldInteractionBlocked = true };
            executor.ContinueFromPrepare();
            Assert.That(routine.MoveNext(), Is.False);
            Assert.That(action.Executed, Is.False);
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(executor.IsIdle, Is.True);
        }

        [Test]
        public void TheCalendarResumesWhileANonPausingScreenRemainsOpen()
        {
            Assert.That(GameStateManager.Instance, Is.Null);
            using var services = new Core.Common.Editor.GameTestFixture("Isolated game clock");
            services.AddSingleton<GameStateManager>();
            var clock = services.AddSingleton<UrTimeManager>();
            GameState.Time.hour = 6;
            GameState.Time.minute = 0;
            GameState.Time.secondsTowardNextMinute = 10;
            _first.Open(_character, ScreenPauseMode.GameClock);
            _second.Open(_character, ScreenPauseMode.None);
            Invoke(clock, "Update");
            Assert.That(GameState.Time.minute, Is.Zero);
            Assert.That(GameState.Time.secondsTowardNextMinute, Is.EqualTo(10));
            _first.Close();
            Invoke(clock, "Update");
            Assert.That(GameState.Time.minute, Is.GreaterThan(0));
            Assert.That(_second.Visible, Is.True);

        }

        [Test]
        public void LocationRegistrationRetriesAfterAllManagersHaveAwakened()
        {
            var faderObject = new GameObject("Required transition fader", typeof(RectTransform), typeof(ScreenFader));
            faderObject.transform.SetParent(_root.transform);
            var fader = faderObject.GetComponent<ScreenFader>();
            Invoke(fader, "Awake");
            typeof(UrGUIManager).GetField("screenFader", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_manager, fader);
            Assert.That(LevelManager.Instance, Is.Null);
            Invoke(_manager, "OnEnable");
            using var services = new Core.Common.Editor.GameTestFixture("Late location manager");
            var level = services.RegisterSingleton<LevelManager>();
            try
            {
                Invoke(_manager, "Start");
                var listeners = (System.Collections.Generic.List<ILocationLifecycle>)typeof(LevelManager)
                    .GetField("_lifecycleComponents", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(level);
                Assert.That(listeners, Contains.Item(_manager));
                Invoke(_manager, "Start");
                Assert.That(listeners.FindAll(listener => ReferenceEquals(listener, _manager)).Count, Is.EqualTo(1));
            }
            finally
            {
                level.UnregisterLifecycle(_manager);

            }
        }

        internal static Input.InputManager CreateScreenServices(Core.Common.Editor.GameTestFixture fixture,
            Action<UnityEngine.InputSystem.InputActionAsset> configureActions = null)
        {
            fixture.AddSingleton<CharacterManager>();
            return fixture.AddSingleton<Input.InputManager>(input =>
            {
                var player = input.GetComponent<UnityEngine.InputSystem.PlayerInput>();
                var authored = UnityEditor.AssetDatabase.LoadAssetAtPath<UnityEngine.InputSystem.InputActionAsset>(
                    "Assets/InputSystem_Actions.inputactions");
                player.actions = fixture.Own(Object.Instantiate(authored));
                configureActions?.Invoke(player.actions);
                player.defaultActionMap = "PlayerControls";
                input.gameObject.SetActive(true);
            });
        }

        internal static void Invoke(object target, string method) => Core.Common.Editor.GameTestFixture.Invoke(target, method);
    }
}

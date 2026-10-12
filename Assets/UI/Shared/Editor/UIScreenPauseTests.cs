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
        private UrGUIManager _manager;
        private PauseTestScreen _first;
        private PauseTestScreen _second;
        private GameCharacter _character;
        private float _timeScale;

        [SetUp]
        public void SetUp()
        {
            Assert.That(UrGUIManager.Instance, Is.Null, "Run outside a game session.");
            _timeScale = Time.timeScale;
            _root = new GameObject("Screen pause tests");
            CreateScreenServices(_root);
            _manager = _root.AddComponent<UrGUIManager>();
            Invoke(_manager, "Awake");
            Invoke(_manager, "OnEnable");
            _first = _root.AddComponent<PauseTestScreen>();
            _second = _root.AddComponent<PauseTestScreen>();
            var characterRoot = new GameObject("Uninitialized test character");
            characterRoot.transform.SetParent(_root.transform);
            characterRoot.SetActive(false);
            _character = characterRoot.AddComponent<GameCharacter>();
        }

        [TearDown]
        public void TearDown()
        {
            _manager.CloseAll();
            Invoke(_manager, "OnDisable");
            Invoke(_manager, "OnDestroy");
            ReleaseScreenServices(_root);
            Object.DestroyImmediate(_root);
            Time.timeScale = _timeScale;
        }

        private MainCharacter CreateMainCharacter(string name)
        {
            var root = new GameObject(name);
            root.SetActive(false);
            root.transform.SetParent(_root.transform);
            return root.AddComponent<MainCharacter>();
        }

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
            Assert.That(_character.IsFrozen, Is.True);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.True);
            Assert.That(original.style.display.value, Is.EqualTo(UnityEngine.UIElements.DisplayStyle.None));
            Assert.That(replacement.style.display.value, Is.EqualTo(UnityEngine.UIElements.DisplayStyle.Flex));
            Assert.That(replacement.enabledSelf, Is.False);
            _second.Close();
            _first.Close();
            Assert.That(replacement.style.display.value, Is.EqualTo(UnityEngine.UIElements.DisplayStyle.None));
            Assert.That(_first.CloseCount, Is.EqualTo(1));
            Assert.That(_character.IsFrozen, Is.False);
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
            Assert.That(_character.IsFrozen, Is.EqualTo(characterPaused));
            Assert.That(UrGUIManager.IsGameClockPaused, Is.EqualTo(clockPaused));
            Assert.That(Time.timeScale, Is.EqualTo(_timeScale), "Screen pauses must preserve gameplay time-scale requests.");
            _first.Close();
            Assert.That(_first.Visible, Is.False);
            Assert.That(_character.IsFrozen, Is.False);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
        }

        [TestCase(true)]
        [TestCase(false)]
        public void OverlappingScreensKeepTheirPauseUntilTheLastOwnerCloses(bool closeFirst)
        {
            _first.Open(_character);
            _second.Open(_character);
            (closeFirst ? _first : _second).Close();
            Assert.That(_character.IsFrozen, Is.True);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.True);
            (closeFirst ? _second : _first).Close();
            Assert.That(_character.IsFrozen, Is.False);
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
            Assert.That(_character.IsFrozen, Is.False);
        }

        [Test]
        public void ReopeningOneScreenUpdatesItsRequestWithoutLeakingAnOwner()
        {
            _first.Open(_character);
            _first.Open(_character);
            _first.Open(_character, ScreenPauseMode.Character);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
            Assert.That(_character.IsFrozen, Is.True);
            _first.Close();
            _first.Close();
            Assert.That(_character.IsFrozen, Is.False);
        }

        [Test]
        public void ClosingAScreenPreservesAnExistingOrLaterGameplayFreeze()
        {
            SetCondition(ConditionState.Frozen);
            _first.Open(_character);
            _first.Close();
            Assert.That(_character.IsFrozen, Is.True);
            _character.UnFreeze();
            _first.Open(_character);
            SetCondition(ConditionState.Frozen);
            _first.Close();
            Assert.That(_character.IsFrozen, Is.True);
        }

        [Test]
        public void GameplayUnfreezeCannotReleaseAnOpenScreensPause()
        {
            _first.Open(_character);
            _character.UnFreeze();
            Assert.That(_character.IsFrozen, Is.True);
            _first.Close();
            Assert.That(_character.IsFrozen, Is.False);
        }

        [Test]
        public void UpdatingTheTargetReleasesOnlyTheOldCharacter()
        {
            var otherRoot = new GameObject("Other test character");
            otherRoot.transform.SetParent(_root.transform);
            otherRoot.SetActive(false);
            var other = otherRoot.AddComponent<GameCharacter>();
            _first.Open(_character);
            _first.Open(other);
            Assert.That(_character.IsFrozen, Is.False);
            Assert.That(other.IsFrozen, Is.True);
            _first.Close();
            Assert.That(other.IsFrozen, Is.False);
        }

        [Test]
        public void DisablingTheScreenReleasesItsRequests()
        {
            _first.Open(_character);
            typeof(ManagedUIScreen).GetMethod("OnDisable", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(_first, null);
            Assert.That(_first.Visible, Is.False);
            Assert.That(_character.IsFrozen, Is.False);
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
            Assert.That(_character.IsFrozen, Is.False);
            Assert.That(UrGUIManager.HasOpenScreens, Is.False);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
        }

        [Test]
        public void FailedPresentationReleasesThePause()
        {
            Assert.Throws<InvalidOperationException>(() => _manager.Open(_first,
                () => throw new InvalidOperationException("Failed presentation"), () => { },
                ScreenPauseMode.CharacterAndClock, _character));
            Assert.That(_character.IsFrozen, Is.False);
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
            var context = _root.AddComponent<PlayerInteractionContext>();
            typeof(Core.Singleton<PlayerInteractionContext>)
                .GetMethod("Awake", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(context, null);
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
            Assert.That(_character.IsFrozen, Is.True);
            snapshot = snapshot with { WorldInteractionBlocked = true };
            executor.ContinueFromPrepare();
            Assert.That(routine.MoveNext(), Is.False);
            Assert.That(action.Executed, Is.False);
            Assert.That(_character.IsFrozen, Is.False);
            Assert.That(executor.IsIdle, Is.True);
        }

        [Test]
        public void TheCalendarResumesWhileANonPausingScreenRemainsOpen()
        {
            Assert.That(GameStateManager.Instance, Is.Null);
            var stateRoot = new GameObject("Isolated game clock");
            stateRoot.SetActive(false);
            var state = stateRoot.AddComponent<GameStateManager>();
            typeof(Core.Singleton<GameStateManager>).GetMethod("Awake", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(state, null);
            var clock = stateRoot.AddComponent<UrTimeManager>();
            try
            {
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
            finally
            {
                typeof(GameStateManager).GetMethod("OnDestroy", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(state, null);
                Object.DestroyImmediate(stateRoot);
            }
        }

        [Test]
        public void LocationRegistrationRetriesAfterAllManagersHaveAwakened()
        {
            Assert.That(LevelManager.Instance, Is.Null);
            Invoke(_manager, "OnEnable");
            var levelRoot = new GameObject("Late location manager");
            levelRoot.SetActive(false);
            var level = levelRoot.AddComponent<LevelManager>();
            typeof(Core.Singleton<LevelManager>).GetField("_instance", BindingFlags.Static | BindingFlags.NonPublic)
                .SetValue(null, level);
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
                typeof(Core.Singleton<LevelManager>).GetField("_instance", BindingFlags.Static | BindingFlags.NonPublic)
                    .SetValue(null, null);
                Object.DestroyImmediate(levelRoot);
            }
        }

        internal static Input.InputManager CreateScreenServices(GameObject parent)
        {
            var characterRoot = new GameObject("Character owner");
            characterRoot.transform.SetParent(parent.transform);
            var characters = characterRoot.AddComponent<CharacterManager>();
            Invoke(characters, "Awake");
            var root = new GameObject("Input owner");
            root.transform.SetParent(parent.transform);
            root.SetActive(false);
            var player = root.AddComponent<UnityEngine.InputSystem.PlayerInput>();
            var authored = UnityEditor.AssetDatabase.LoadAssetAtPath<UnityEngine.InputSystem.InputActionAsset>(
                "Assets/InputSystem_Actions.inputactions");
            player.actions = Object.Instantiate(authored);
            player.defaultActionMap = "PlayerControls";
            var input = root.AddComponent<Input.InputManager>();
            root.SetActive(true);
            Invoke(input, "Awake");
            return input;
        }

        internal static void ReleaseScreenServices(GameObject parent)
        {
            var characters = parent.GetComponentInChildren<CharacterManager>(true);
            Invoke(characters, "OnDestroy");
            Object.DestroyImmediate(characters.gameObject);
            var input = parent.GetComponentInChildren<Input.InputManager>(true);
            var asset = input.Actions;
            typeof(Core.Singleton<Input.InputManager>).GetMethod("OnDestroy",
                BindingFlags.Instance | BindingFlags.NonPublic).Invoke(input, null);
            Object.DestroyImmediate(input.gameObject);
            Object.DestroyImmediate(asset);
        }

        internal static void Invoke(object target, string method) => target.GetType()
            .GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic).Invoke(target, null);
    }
}

using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using Character;
using Animancer;
using Core.Common.Editor;
using Core.Events;
using Core.Game;
using Core.Location;
using Interaction;
using DG.Tweening;
using NUnit.Framework;
using UI.Shared;
using UnityEditor;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace Core.TimeAndWeather.Editor
{
    /// <summary>Verifies the blackout boundary and input/character restoration without waiting for real-time fades.</summary>
    public sealed class DayTransitionTests : IEventListener<NewDayEvent>
    {
        private GameTestFixture _fixture;
        private UrTimeManager _clock;
        private Input.InputManager _input;
        private MainCharacter _character;
        private CanvasGroup _canvas;
        private IEnumerator _routine;
        private int _newDays;
        private Stack<IEnumerator> _steps;

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Day transition tests");
            _fixture.Root.SetActive(true);
            _fixture.AddSingleton<GameStateManager>();
            _fixture.AddSingleton<CharacterManager>();
            var level = _fixture.RegisterSingleton<LevelManager>();
            Set(level, "<SceneReady>k__BackingField", true);
            var homeLocation = _fixture.Own(ScriptableObject.CreateInstance<LocationData>());
            homeLocation.id = "test:home";
            Set(level, "<CurrentLocationData>k__BackingField", homeLocation);
            _fixture.AddSingleton<PlayerStateManager>();
            var bedObject = Child("Home bed");
            bedObject.AddComponent<BoxCollider2D>();
            var bed = bedObject.AddComponent<Bed>();
            var bedSlot = bed.GetComponent<InteractionSlot>();
            var wakePoint = Child("Wake point").transform;
            wakePoint.position = new Vector3(3, 2, 0);
            Set(bedSlot, "exitPoint", wakePoint);
            Set(bedSlot, "occupiedAnimation", AssetDatabase.LoadAssetAtPath<Character.Animations.CharacterAnimationDefinition>("Assets/Interaction/PrototypeSittingAnimation.asset"));
            GameTestFixture.Invoke(bedSlot, "Awake");
            GameTestFixture.Invoke(bed, "Awake");
            GameState.Player.Home = new PlayerHomeState(homeLocation.id, bed.PersistentId);
            _input = _fixture.AddSingleton<Input.InputManager>(input =>
            {
                input.GetComponent<PlayerInput>().actions = _fixture.Own(Object.Instantiate(
                    AssetDatabase.LoadAssetAtPath<InputActionAsset>("Assets/InputSystem_Actions.inputactions")));
                input.gameObject.SetActive(true);
            });
            var gui = _fixture.AddSingleton<UrGUIManager>(manager => manager.gameObject.SetActive(true));

            _character = _fixture.CreateCharacter();
            _character.transform.parent.gameObject.SetActive(true);
            _character.Graphics.gameObject.SetActive(true); // Normal location entry reveals the artwork.
            GameTestFixture.Invoke(_character.Animator, "Awake");
            GameTestFixture.Invoke(_character, "OnEnable");
            CharacterManager.Instance.RegisterMainCharacter(_character);

            var fader = Child("Fader").AddComponent<ScreenFader>();
            GameTestFixture.Invoke(fader, "Awake");
            fader.ShowSceneImmediately();
            _canvas = fader.GetComponent<CanvasGroup>();

            var clock = _fixture.AddSingleton<UrTimeManager>(time => time.gameObject.SetActive(true));
            _clock = clock;

            Set(gui, "screenFader", fader);
            GameTestFixture.Invoke(gui, "Start");
            var weather = _fixture.Own(ScriptableObject.CreateInstance<WeatherData>());
            var season = _fixture.Own(ScriptableObject.CreateInstance<SeasonData>());
            season.daylightColorGradient = new Gradient();
            season.weatherData = new Util.WeightedList<WeatherData>();
            season.weatherData.Add(weather);
            _fixture.AddSingleton<WeatherManager>(manager =>
            {
                Set(manager, "postProcessingVolume", Child("Weather volume").AddComponent<Volume>());
                Set(manager, "defaultVolumeProfile", _fixture.Own(ScriptableObject.CreateInstance<VolumeProfile>()));
                manager.gameObject.SetActive(true);
            });
            Set(clock, "seasons", new[] { season });
            clock.Start();
            GameState.Time.daysSinceStart = 5;
            GameState.Time.dayOfSeason = 5;
            GameState.Time.hour = 23;
            _newDays = 0;
            EventBus<NewDayEvent>.Subscribe(this);
            _steps = new Stack<IEnumerator>();
            PrepareNight(23, 0, DayEndReason.Sleep);
        }

        [TearDown]
        public void TearDown()
        {
            (_routine as IDisposable)?.Dispose();
            EventBus<NewDayEvent>.Unsubscribe(this);
            if (_character) GameTestFixture.Invoke(_character, "OnDisable");
            _fixture?.Dispose();
        }

        [Test]
        public void StartingHomeIsAssignedOnceWithoutOverwritingASavedChoice()
        {
            var manager = PlayerStateManager.Instance;
            Set(manager, "_startingHomeLocation", LevelManager.Instance.CurrentLocationData);
            Set(manager, "_startingBedId", "starting-bed");
            GameState.Player.Home = null;
            manager.InitializeHome();
            Assert.That(GameState.Player.Home.BedId, Is.EqualTo("starting-bed"));
            GameState.Player.Home = new PlayerHomeState("test:another-home", "selected-bed");
            manager.InitializeHome();
            Assert.That(GameState.Player.Home.LocationId, Is.EqualTo("test:another-home"));
            Assert.That(GameState.Player.Home.BedId, Is.EqualTo("selected-bed"));
        }

        [Test]
        public void MissingHomeBedFailsBehindBlackWithoutAdvancingTheDay()
        {
            GameState.Player.Home.BedId = "missing-bed";
            NextYield();
            DOTween.Complete(_canvas, true);
            Assert.Throws<InvalidOperationException>(() => NextYield());
            Assert.That(GameState.Time.daysSinceStart, Is.EqualTo(5));
            Assert.That(_newDays, Is.Zero);
            ((IDisposable)_routine).Dispose();
            Assert.That(_input.Actions.enabled, Is.True);
        }

        [Test]
        public void SharedCoverAndRevealHaveNoOvernightGameplayEffects()
        {
            var gui = UrGUIManager.Instance;
            var cover = gui.CoverScene(_character.transform);
            Assert.That(cover.MoveNext(), Is.True);
            DOTween.Complete(_canvas, true);
            Assert.That(cover.MoveNext(), Is.False);
            Assert.That(_canvas.alpha, Is.EqualTo(1f));

            var reveal = gui.RevealScene(_character.transform);
            Assert.That(reveal.MoveNext(), Is.True);
            Assert.That(reveal.Current, Is.Not.TypeOf<WaitForSecondsRealtime>());
            DOTween.Complete(_canvas, true);
            Assert.That(reveal.MoveNext(), Is.False);
            Assert.That(_canvas.alpha, Is.Zero);
            Assert.That(_canvas.blocksRaycasts, Is.False);
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Normal));
            Assert.That(_input.Actions.enabled, Is.True);
            Assert.That(_newDays, Is.Zero);
        }

        [Test]
        public void MissingMainCharacterFailsBeforeRecordingATransition()
        {
            Set(_clock, "_dayTransitionRoutine", null);
            CharacterManager.Instance.RegisterMainCharacter(null);

            Assert.Throws<InvalidOperationException>(() => _clock.EndDay());
            AssertClockResumes();
            Assert.That(_input.Actions.enabled, Is.True);
            Assert.That(_newDays, Is.Zero);
        }

        [Test]
        public void AdvancesExactlyOnceBehindBlackAndRestoresControlsAfterFadeIn()
        {
            Assert.That(NextYield(), Is.Not.Null);
            Assert.That(_input.Actions.enabled, Is.False);
            Assert.That(_character.IsControlBlocked, Is.True);
            Assert.That(GameState.Time.daysSinceStart, Is.EqualTo(5));
            _clock.EndDay(); // A second bedtime request must not start another transition.

            DOTween.Complete(_canvas, true);
            Assert.That(NextYield(), Is.TypeOf<WaitForSecondsRealtime>());
            Assert.That(_newDays, Is.EqualTo(1));
            Assert.That(GameState.Time.hour, Is.EqualTo(6));
            Assert.That(_character.transform.position, Is.EqualTo(new Vector3(3, 2, 0)));
            Assert.That(_input.Actions.enabled, Is.False);

            Assert.That(NextYield(), Is.Not.Null);
            DOTween.Complete(_canvas, true);
            Assert.That(NextYield(), Is.Null);
            Assert.That(_input.Actions.enabled, Is.True);
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Normal));
            Assert.That(_canvas.alpha, Is.Zero);
            Assert.That(_canvas.blocksRaycasts, Is.False);
            AssertClockResumes();
        }

        [Test]
        public void CancellationBeforeBlackoutReleasesControlsWithoutAdvancingTheDay()
        {
            _character.Health.TakeDamage(30);
            _character.Stamina.ConsumeStamina(40);
            NextYield();
            GameTestFixture.Invoke(_clock, "OnDisable");
            Assert.That(_input.Actions.enabled, Is.True);
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Normal));
            Assert.That(GameState.Time.daysSinceStart, Is.EqualTo(5));
            Assert.That(_canvas.alpha, Is.Zero);
            Assert.That(_canvas.blocksRaycasts, Is.False);
            Assert.That(_character.Health.CurrentHealth, Is.EqualTo(70));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(60));
            AssertClockResumes();
        }

        [TestCase(20, 59, DayEndReason.Sleep, 120)]
        [TestCase(21, 0, DayEndReason.Sleep, 110)]
        [TestCase(22, 59, DayEndReason.Sleep, 110)]
        [TestCase(23, 0, DayEndReason.Sleep, 100)]
        [TestCase(20, 0, DayEndReason.PassedOut, 60)]
        [TestCase(23, 0, DayEndReason.PassedOut, 60)]
        public void OvernightRecoveryUsesTheOriginalBedtimeAndReasonBehindBlack(int hour, int minute, DayEndReason reason, int expectedStamina)
        {
            PrepareNight(hour, minute, reason);
            _character.Health.TakeDamage(70);
            _character.Stamina.ConsumeStamina(80);
            NextYield();
            if (reason == DayEndReason.PassedOut) CompleteCollapse();
            Assert.That(_character.Health.CurrentHealth, Is.EqualTo(30));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(20));
            DOTween.Complete(_canvas, true);
            Assert.That(NextYield(), Is.TypeOf<WaitForSecondsRealtime>());
            Assert.That(_canvas.alpha, Is.EqualTo(1));
            Assert.That(_character.Health.CurrentHealth, Is.EqualTo(100));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(expectedStamina));
            Assert.That(_character.Stamina.MaxStamina, Is.EqualTo(100));
            NextYield();
            DOTween.Complete(_canvas, true);
            Assert.That(NextYield(), Is.Null);
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(expectedStamina), "Reveal must not apply recovery twice.");
        }

        [TestCase(DayEndReason.Sleep, 120)]
        [TestCase(DayEndReason.PassedOut, 60)]
        public void OvernightRecoveryReplacesThePreviousSurplus(DayEndReason reason, int expectedStamina)
        {
            PrepareNight(20, 0, reason);
            _character.Stamina.GrantOvercharge(50);
            NextYield();
            if (reason == DayEndReason.PassedOut) CompleteCollapse();
            DOTween.Complete(_canvas, true);
            NextYield();
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(expectedStamina));
        }

        [Test]
        public void CalendarAdvancementAloneDoesNotGrantSleepRecovery()
        {
            _character.Health.TakeDamage(30);
            _character.Stamina.ConsumeStamina(40);
            EventBus<NewDayEvent>.Unsubscribe(this); // This test intentionally advances without the presentation sequence.
            _clock.StartNewDay();
            Assert.That(_character.Health.CurrentHealth, Is.EqualTo(70));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(60));
        }

        [TestCase(100)]
        [TestCase(150)]
        public void ExhaustionStartsCollapseThenWakesAtHomeWithThePassOutPenalty(int amount)
        {
            Set(_clock, "_dayTransitionRoutine", null);
            _character.Health.TakeDamage(30);
            var position = _character.transform.position;
            var graphics = _character.Graphics;
            var rotation = graphics.localRotation;
            _character.Stamina.ConsumeStamina(amount);
            _routine = (IEnumerator)typeof(UrTimeManager).GetField("_dayTransitionRoutine", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(_clock);
            Assert.That(_routine, Is.Not.Null, "The depletion event must start the forced-night sequence.");
            _clock.StopCoroutine(_routine);
            _steps.Clear();
            _steps.Push(_routine);
            // AnimancerState is Unity's animation wait; resume the outer iterator after completing the clip.
            Assert.That(_routine.Current, Is.InstanceOf<AnimancerState>());
            Assert.That(_character.IsControlBlocked, Is.True);
            Assert.That(_character.PerformPrimaryAction.ActionExecutor.IsIdle, Is.True);
            Assert.That(_canvas.alpha, Is.Zero, "The collapse precedes the blackout.");
            CompleteCollapse();
            var death = _character.Animator.AnimationLibrary.GetDirectional("Death", _character.Orientation.FacingDirection);
            Assert.That(CollapseState().Clip, Is.SameAs(death));
            var poses = AnimationUtility.GetObjectReferenceCurve(death,
                EditorCurveBinding.PPtrCurve("", typeof(SpriteRenderer), "m_Sprite"));
            Assert.That(graphics.GetComponent<SpriteRenderer>().sprite, Is.SameAs(poses[^1].value));
            Assert.That(graphics.localRotation, Is.EqualTo(rotation));
            Assert.That(_character.transform.position, Is.EqualTo(position), "Only the artwork falls, not the physics root.");
            DOTween.Complete(_canvas, true);
            NextYield();
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(60));
            Assert.That(_character.Health.CurrentHealth, Is.EqualTo(100));
            Assert.That(_character.transform.position, Is.EqualTo(new Vector3(3, 2, 0)));
            Assert.That(graphics.localRotation, Is.EqualTo(rotation));
            Assert.That(graphics.GetComponent<SpriteRenderer>().sprite, Is.Not.SameAs(poses[^1].value));
            Assert.That(_newDays, Is.EqualTo(1));
            NextYield();
            DOTween.Complete(_canvas, true);
            Assert.That(NextYield(), Is.Null);
            Assert.That(_character.IsControlBlocked, Is.False);
        }

        [Test]
        public void CancellingDuringCollapseRestoresArtworkWithoutRecoveryOrDayAdvance()
        {
            PrepareNight(20, 0, DayEndReason.PassedOut);
            var graphics = _character.Graphics;
            var position = graphics.localPosition;
            var rotation = graphics.localRotation;
            var scale = graphics.localScale;
            var originalSprite = graphics.GetComponent<SpriteRenderer>().sprite;
            NextYield();
            var state = CollapseState();
            state.Time = state.Length * 0.5f;
            _character.GetComponentInChildren<NamedAnimancerComponent>().Evaluate();
            Assert.That(graphics.GetComponent<SpriteRenderer>().sprite, Is.Not.SameAs(originalSprite));
            Assert.That(graphics.localRotation, Is.EqualTo(rotation));
            var fallenSprite = graphics.GetComponent<SpriteRenderer>().sprite;
            _clock.CancelDayTransition();
            Assert.That(state.IsPlaying, Is.False);
            Assert.That(graphics.localPosition, Is.EqualTo(position));
            Assert.That(graphics.localRotation, Is.EqualTo(rotation));
            Assert.That(graphics.localScale, Is.EqualTo(scale));
            Assert.That(graphics.GetComponent<SpriteRenderer>().sprite, Is.Not.SameAs(fallenSprite));
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(_input.Actions.enabled, Is.True);
            Assert.That(_newDays, Is.Zero);
            Assert.That(GameState.Time.daysSinceStart, Is.EqualTo(5));
        }

        [Test]
        public void OtherCharactersAndDeadPlayersDoNotStartAnExhaustionTransition()
        {
            Set(_clock, "_dayTransitionRoutine", null);
            var other = _fixture.CreateCharacter("Other character");
            other.Stamina.ConsumeStamina(100);
            Assert.That(typeof(UrTimeManager).GetField("_dayTransitionRoutine", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(_clock), Is.Null);
            _character.SetConditionState(ConditionState.Dead);
            _character.Stamina.ConsumeStamina(100);
            Assert.That(typeof(UrTimeManager).GetField("_dayTransitionRoutine", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(_clock), Is.Null);
        }

        private AnimancerState CollapseState() => (AnimancerState)typeof(UrCharacterAnimator)
            .GetField("_interactionState", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(_character.Animator);

        private void CompleteCollapse()
        {
            var state = CollapseState();
            state.Time = state.Length;
            _character.GetComponentInChildren<NamedAnimancerComponent>().Evaluate();
            NextYield(); // Begin covering only after the collapse has completed.
        }

        private void PrepareNight(int hour, int minute, DayEndReason reason)
        {
            GameState.Time.hour = hour;
            GameState.Time.minute = minute;
            _routine = (IEnumerator)typeof(UrTimeManager).GetMethod("TransitionToNextDay", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(_clock, new object[] { _character, reason, hour });
            // EndDay normally captures bedtime and stores this before starting Unity's scheduler.
            Set(_clock, "_dayTransitionRoutine", _routine);
            _steps.Clear();
            _steps.Push(_routine);
        }

        [Test]
        public void ClockDoesNotAccumulateMoreTimeWhileFading()
        {
            NextYield();
            GameState.Time.secondsTowardNextMinute = 1000f;
            GameTestFixture.Invoke(_clock, "Update");
            Assert.That(GameState.Time.daysSinceStart, Is.EqualTo(5));
            Assert.That(GameState.Time.hour, Is.EqualTo(23));
            Assert.That(GameState.Time.secondsTowardNextMinute, Is.EqualTo(1000f));
        }

        [Test]
        public void CleanupPreservesAnExistingInputGateAndADeathDuringTransition()
        {
            _input.OnLocationLeave(null);
            NextYield();
            _character.SetConditionState(ConditionState.Dead);
            ((IDisposable)_routine).Dispose();
            Assert.That(_input.Actions.enabled, Is.False);
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Dead));
        }

        [Test]
        public void ALocationInputGateRaisedDuringTransitionSurvivesCleanup()
        {
            NextYield();
            _input.OnLocationLeave(null);
            ((IDisposable)_routine).Dispose();
            Assert.That(_input.Actions.enabled, Is.False);
        }

        [Test]
        public void LocationEntryCannotEnableInputUntilTheTransitionFinishes()
        {
            NextYield();
            _input.OnLocationEnter(null);
            Assert.That(_input.Actions.enabled, Is.False);
            ((IDisposable)_routine).Dispose();
            Assert.That(_input.Actions.enabled, Is.True);
        }

        [Test]
        public void StartingTheTransitionClosesMenusAndReleasesTheirPauses()
        {
            var screen = Child("Open menu").AddComponent<UI.Shared.Editor.PauseTestScreen>();
            Assert.That(screen.Open(_character, ScreenPauseMode.CharacterAndClock), Is.True);
            NextYield();
            Assert.That(screen.Visible, Is.False);
            Assert.That(UrGUIManager.HasOpenScreens, Is.False);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
            Assert.That(_input.Actions.enabled, Is.False);
        }

        [Test]
        public void DisablingThePresenterCancelsTheSequenceAndReleasesOtherOwners()
        {
            NextYield();
            GameTestFixture.Invoke(UrGUIManager.Instance, "OnDisable");
            Assert.That(_input.Actions.enabled, Is.True);
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Normal));
            Assert.That(_canvas.alpha, Is.Zero);
            AssertClockResumes();
        }

        private void AssertClockResumes()
        {
            GameState.Time.hour = 6;
            GameState.Time.minute = 0;
            GameState.Time.secondsTowardNextMinute = 10f;
            GameTestFixture.Invoke(_clock, "Update");
            Assert.That(GameState.Time.minute, Is.EqualTo(10));
        }

        [Test]
        public void CancellingAfterTheDailyUpdateKeepsTheNewDayAndReleasesControls()
        {
            NextYield();
            DOTween.Complete(_canvas, true);
            NextYield();
            ((IDisposable)_routine).Dispose();
            Assert.That(GameState.Time.daysSinceStart, Is.EqualTo(6));
            Assert.That(_newDays, Is.EqualTo(1));
            Assert.That(_input.Actions.enabled, Is.True);
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Normal));
            Assert.That(_canvas.alpha, Is.Zero);
        }

        // Drive nested presentation coroutines to their next wait without real-time delays.
        private object NextYield()
        {
            while (_steps.Count > 0)
            {
                var current = _steps.Peek();
                if (!current.MoveNext()) { _steps.Pop(); continue; }
                if (current.Current is IEnumerator nested && !(nested is CustomYieldInstruction) && !(nested is AnimancerState))
                {
                    _steps.Push(nested);
                    continue;
                }
                return current.Current;
            }
            return null;
        }

        public void OnEvent(NewDayEvent change)
        {
            _newDays++;
            Assert.That(_canvas.alpha, Is.EqualTo(1f));
            Assert.That(_input.Actions.enabled, Is.False);
        }

        private GameObject Child(string name)
        {
            var child = new GameObject(name);
            child.transform.SetParent(_fixture.Root.transform);
            return child;
        }

        private static void Set(object target, string name, object value, Type owner = null) =>
            (owner ?? target.GetType()).GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(target, value);
    }
}

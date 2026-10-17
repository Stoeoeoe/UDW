using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using Character;
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
            GameTestFixture.Invoke(_character, "OnEnable");
            CharacterManager.Instance.RegisterMainCharacter(_character);

            var fader = Child("Fader").AddComponent<ScreenFader>();
            GameTestFixture.Invoke(fader, "Awake");
            fader.ShowSceneImmediately();
            _canvas = fader.GetComponent<CanvasGroup>();

            var clock = _fixture.AddSingleton<UrTimeManager>(time => time.gameObject.SetActive(true));
            _clock = clock;
            Set(clock, "_timeScaleLastTime", Time.timeScale);
            Set(gui, "screenFader", fader);
            GameTestFixture.Invoke(gui, "Start");
            var weather = _fixture.Own(ScriptableObject.CreateInstance<WeatherData>());
            var season = _fixture.Own(ScriptableObject.CreateInstance<SeasonData>());
            season.daylightColorGradient = new Gradient();
            season.weatherData = new Util.WeightedList<WeatherData>();
            season.weatherData.Add(weather);
            Set(clock, "currentSeasonData", season);
            Set(clock, "postProcessingVolume", Child("Weather volume").AddComponent<Volume>());
            Set(clock, "defaultVolumeProfile", _fixture.Own(ScriptableObject.CreateInstance<VolumeProfile>()));
            Set(clock, "_weatherParentGo", Child("Weather effects"));
            GameState.Time.daysSinceStart = 5;
            GameState.Time.dayOfSeason = 5;
            GameState.Time.hour = 23;
            _newDays = 0;
            EventBus<NewDayEvent>.Subscribe(this);
            _routine = (IEnumerator)typeof(UrTimeManager).GetMethod("TransitionToNextDay", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(_clock, new object[] { _character });
            // EndDay normally stores this before starting Unity's coroutine scheduler.
            Set(_clock, "_dayTransitionRoutine", _routine);
            _steps = new Stack<IEnumerator>();
            _steps.Push(_routine);
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
            NextYield();
            GameTestFixture.Invoke(_clock, "OnDisable");
            Assert.That(_input.Actions.enabled, Is.True);
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Normal));
            Assert.That(GameState.Time.daysSinceStart, Is.EqualTo(5));
            Assert.That(_canvas.alpha, Is.Zero);
            Assert.That(_canvas.blocksRaycasts, Is.False);
            AssertClockResumes();
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
                if (current.Current is IEnumerator nested && !(nested is CustomYieldInstruction))
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

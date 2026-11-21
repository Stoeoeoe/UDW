using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;
using Animancer;
using Character;
using Character.Animations;
using Core.Common.Editor;
using Core.Events;
using Core.Game;
using Core.Location;
using DG.Tweening;
using Input;
using Interaction;
using NUnit.Framework;
using UI.Shared;
using UI.Shared.Editor;
using UnityEditor;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.TestTools;
using UnityEngine.UIElements;
using Object = UnityEngine.Object;
using static Core.Common.Editor.Reflect;

namespace Core.TimeAndWeather.Editor
{
    /// <summary>Verifies the blackout boundary and input/character restoration without waiting for real-time fades.</summary>
    public sealed class DayTransitionTests : GameTest, IEventListener<NewDayEvent>
    {

        private GameClock _clock;
        private OvernightTransition _overnight;
        private InputManager _input;
        private MainCharacter _character;
        private CanvasGroup _canvas;
        private IEnumerator _routine;
        private int _newDays;
        private Stack<IEnumerator> _steps;

        [SetUp]
        public void SetUp()
        {

            Game.Root.SetActive(true);

            var level = Game.Get<LevelManager>();
            Game.Ready = true;
            var homeLocation = Game.Asset<LocationData>();
            homeLocation.SetId("test:home");
            Game.Location = homeLocation;

            var bedObject = Child("Home bed");
            bedObject.AddComponent<BoxCollider2D>();
            var bed = Game.Add<Bed>(bedObject);
            var bedSlot = bed.GetComponent<InteractionSlot>();
            var wakePoint = Child("Wake point").transform;
            wakePoint.position = new Vector3(3, 2, 0);
            Set(bedSlot, "exitPoint", wakePoint);
            Set(bedSlot, "occupiedAnimation", AssetDatabase.LoadAssetAtPath<CharacterAnimationDefinition>("Assets/Interaction/PrototypeSittingAnimation.asset"));
            GameTestFixture.Invoke(bedSlot, "Awake");
            GameTestFixture.Invoke(bed, "Awake");
            Game.State.Player.Home = new PlayerHomeState(homeLocation.Id, bed.PersistentId);
            _input = Game.Start<InputManager>(input =>
            {
                input.GetComponent<PlayerInput>().actions = Game.Own(Game.InjectObject(Object.Instantiate(
                    AssetDatabase.LoadAssetAtPath<InputActionAsset>("Assets/InputSystem_Actions.inputactions"))));
                input.gameObject.SetActive(true);
            });
            var gui = Game.Start<UrGUIManager>(manager => manager.gameObject.SetActive(true));

            _character = Game.CreateCharacter();
            _character.transform.parent.gameObject.SetActive(true);
            _character.Graphics.gameObject.SetActive(true); // Normal location entry reveals the artwork.
            GameTestFixture.Invoke(_character.Animator, "Awake");
            GameTestFixture.Invoke(_character, "OnEnable");
            Game.Get<CharacterManager>().RegisterMainCharacter(_character);

            var fader = Child("Fader").AddComponent<ScreenFader>();
            GameTestFixture.Invoke(fader, "Awake");
            fader.ShowSceneImmediately();
            _canvas = fader.GetComponent<CanvasGroup>();

            _overnight = Game.Start<OvernightTransition>(overnight => overnight.gameObject.SetActive(true));
            _clock = Game.Clock;
            _clock.Start();

            Set(gui, "screenFader", fader);
            Set(gui, "toolHud", Child("Hotbar").AddComponent<CanvasGroup>());
            var document = gui.GetComponent<UIDocument>();
            document.panelSettings = AssetDatabase.LoadAssetAtPath<PanelSettings>("Assets/UI/InventoryScreen/InventoryPanelSettings.asset");
            document.visualTreeAsset = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/UI/Hud/GameHud.uxml");
            GameTestFixture.Invoke(gui, "Start");
            Game.State.Time.daysSinceStart = 5;
            Game.State.Time.dayOfSeason = 5;
            Game.State.Time.hour = 23;
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

        }

        [Test]
        public void StartingHomeIsAssignedOnceWithoutOverwritingASavedChoice()
        {
            var manager = Game.Get<PlayerStateManager>();
            var settings = Game.Get<PlayerSettings>();
            settings.startingHomeLocation = Game.Location;
            settings.startingBedId = "starting-bed";
            Game.State.Player.Home = null;
            manager.InitializeHome();
            Assert.That(Game.State.Player.Home.BedId, Is.EqualTo("starting-bed"));
            Game.State.Player.Home = new PlayerHomeState("test:another-home", "selected-bed");
            manager.InitializeHome();
            Assert.That(Game.State.Player.Home.LocationId, Is.EqualTo("test:another-home"));
            Assert.That(Game.State.Player.Home.BedId, Is.EqualTo("selected-bed"));
        }

        [Test]
        public void MissingHomeBedFailsBehindBlackWithoutAdvancingTheDay()
        {
            Game.State.Player.Home.BedId = "missing-bed";
            NextYield();
            DOTween.Complete(_canvas, true);
            Assert.Throws<InvalidOperationException>(() => NextYield());
            Assert.That(Game.State.Time.daysSinceStart, Is.EqualTo(5));
            Assert.That(_newDays, Is.Zero);
            ((IDisposable)_routine).Dispose();
            Assert.That(_input.Actions.enabled, Is.True);
        }

        [Test]
        public void SharedCoverAndRevealHaveNoOvernightGameplayEffects()
        {
            var gui = Game.Get<UrGUIManager>();
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
            Set(_overnight, "_routine", null);
            Game.Get<CharacterManager>().RegisterMainCharacter(null);

            Assert.Throws<InvalidOperationException>(() => _overnight.EndDay());
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
            Assert.That(Game.State.Time.daysSinceStart, Is.EqualTo(5));
            _overnight.EndDay(); // A second bedtime request must not start another transition.

            DOTween.Complete(_canvas, true);
            Assert.That(NextYield(), Is.TypeOf<WaitForSecondsRealtime>());
            Assert.That(_newDays, Is.EqualTo(1));
            Assert.That(Game.State.Time.hour, Is.EqualTo(6));
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
        public void SleepSavesTheNewMorningToTheCurrentSlot()
        {
            var session = Game.Get<GameStateManager>();
            var slot = "test-" + Guid.NewGuid().ToString("N");
            try
            {
                session.Save(slot);
                NextYield();
                DOTween.Complete(_canvas, true);
                Assert.That(NextYield(), Is.TypeOf<WaitForSecondsRealtime>(), "The new morning has started and been saved before the reveal.");

                Assert.That(Game.Get<GameSaveService>().TryLoad(slot, out var saved), Is.True);
                Assert.That(saved.time.daysSinceStart, Is.EqualTo(6));
                Assert.That(saved.time.hour, Is.EqualTo(6));
                Assert.That(saved.session.Position, Is.EqualTo(new Vector2(3, 2)), "The save is made with the player at the bed.");
            }
            finally { Game.Get<GameSaveService>().Delete(slot); }
        }

        [Test]
        public void SleepWithoutACurrentSlotStillAdvancesTheDay()
        {
            Assert.That(Game.Get<GameStateManager>().CurrentSlot, Is.Null);
            NextYield();
            DOTween.Complete(_canvas, true);
            Assert.That(NextYield(), Is.TypeOf<WaitForSecondsRealtime>());
            Assert.That(Game.State.Time.daysSinceStart, Is.EqualTo(6));
        }

        [Test]
        public void AFailedAutosaveIsLoggedAndDoesNotBlockTheNewDay()
        {
            var session = Game.Get<GameStateManager>();
            var slot = "test-" + Guid.NewGuid().ToString("N");
            var path = GameSaveService.GetSavePath(slot);
            try
            {
                session.Save(slot);
                // A folder where the save file belongs makes the next write fail like a real disk problem.
                File.Delete(path);
                Directory.CreateDirectory(path);
                NextYield();
                DOTween.Complete(_canvas, true);
                LogAssert.Expect(LogType.Error, new Regex($"Autosave to slot '{slot}' failed"));
                Assert.That(NextYield(), Is.TypeOf<WaitForSecondsRealtime>());
                Assert.That(Game.State.Time.daysSinceStart, Is.EqualTo(6));
            }
            finally
            {
                if (Directory.Exists(path)) Directory.Delete(path);
                Game.Get<GameSaveService>().Delete(slot);
            }
        }

        [Test]
        public void CancellationBeforeBlackoutReleasesControlsWithoutAdvancingTheDay()
        {
            _character.Health.TakeDamage(30);
            _character.Stamina.ConsumeStamina(40);
            NextYield();
            GameTestFixture.Invoke(_overnight, "OnDisable");
            Assert.That(_input.Actions.enabled, Is.True);
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Normal));
            Assert.That(Game.State.Time.daysSinceStart, Is.EqualTo(5));
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
            Set(_overnight, "_routine", null);
            _character.Health.TakeDamage(30);
            var position = _character.transform.position;
            var graphics = _character.Graphics;
            var rotation = graphics.localRotation;
            _character.Stamina.ConsumeStamina(amount);
            _routine = RunningSequence();
            Assert.That(_routine, Is.Not.Null, "The depletion event must start the forced-night sequence.");
            _overnight.StopCoroutine(_routine);
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
            _overnight.Cancel();
            Assert.That(state.IsPlaying, Is.False);
            Assert.That(graphics.localPosition, Is.EqualTo(position));
            Assert.That(graphics.localRotation, Is.EqualTo(rotation));
            Assert.That(graphics.localScale, Is.EqualTo(scale));
            Assert.That(graphics.GetComponent<SpriteRenderer>().sprite, Is.Not.SameAs(fallenSprite));
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(_input.Actions.enabled, Is.True);
            Assert.That(_newDays, Is.Zero);
            Assert.That(Game.State.Time.daysSinceStart, Is.EqualTo(5));
        }

        [Test]
        public void OtherCharactersAndDeadPlayersDoNotStartAnExhaustionTransition()
        {
            Set(_overnight, "_routine", null);
            var other = Game.CreateCharacter("Other character");
            other.Stamina.ConsumeStamina(100);
            Assert.That(_overnight.IsRunning, Is.False);
            _character.SetConditionState(ConditionState.Dead);
            _character.Stamina.ConsumeStamina(100);
            Assert.That(_overnight.IsRunning, Is.False);
        }

        private IEnumerator RunningSequence() =>
            (IEnumerator)typeof(OvernightTransition).GetField("_routine", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(_overnight);

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
            Game.State.Time.hour = hour;
            Game.State.Time.minute = minute;
            _routine = (IEnumerator)Call(_overnight, "Run", _character, reason, hour, false);
            // EndDay normally captures bedtime and stores this before starting Unity's scheduler.
            Set(_overnight, "_routine", _routine);
            _steps.Clear();
            _steps.Push(_routine);
        }

        [Test]
        public void PassingBedtimeStartsOnePassOutTransitionAndHoldsTheClock()
        {
            Set(_overnight, "_routine", null);
            Game.State.Time.hour = 22;
            Game.State.Time.minute = 50;

            _clock.Advance(Game.Get<ClockSettings>().secondsPerInGameMinute);

            Assert.That(_overnight.IsRunning, Is.True);
            Assert.That(_clock.IsOvernight, Is.True);
            var sequence = RunningSequence();
            _clock.Advance(1000f);
            Assert.That(RunningSequence(), Is.SameAs(sequence), "A running night must not be restarted.");
            Assert.That(_character.IsControlBlocked, Is.True);
            _routine = sequence;
            _overnight.StopCoroutine(sequence);
        }

        [Test]
        public void TheClockResumesWhenTheSequenceEndsEvenWhenItIsCancelled()
        {
            NextYield();
            Assert.That(_clock.IsOvernight, Is.True);
            _overnight.Cancel();
            Assert.That(_clock.IsOvernight, Is.False);
            Assert.That(_overnight.IsRunning, Is.False);
        }

        [Test]
        public void ClockDoesNotAccumulateMoreTimeWhileFading()
        {
            NextYield();
            Game.State.Time.secondsTowardNextMinute = 1000f;
            _clock.Advance(1000f);
            Assert.That(Game.State.Time.daysSinceStart, Is.EqualTo(5));
            Assert.That(Game.State.Time.hour, Is.EqualTo(23));
            Assert.That(Game.State.Time.secondsTowardNextMinute, Is.EqualTo(1000f));
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
            var screen = Game.InjectObject(Child("Open menu").AddComponent<PauseTestScreen>());
            Assert.That(screen.Open(_character, ScreenPauseMode.CharacterAndClock), Is.True);
            NextYield();
            Assert.That(screen.Visible, Is.False);
            Assert.That(Game.Get<UrGUIManager>().HasOpenScreens, Is.False);
            Assert.That(Game.Get<UrGUIManager>().IsGameClockPaused, Is.False);
            Assert.That(_input.Actions.enabled, Is.False);
        }

        [Test]
        public void DisablingThePresenterCancelsTheSequenceAndReleasesOtherOwners()
        {
            NextYield();
            GameTestFixture.Invoke(Game.Get<UrGUIManager>(), "OnDisable");
            Assert.That(_input.Actions.enabled, Is.True);
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Normal));
            Assert.That(_canvas.alpha, Is.Zero);
            AssertClockResumes();
        }

        private void AssertClockResumes()
        {
            Game.State.Time.hour = 6;
            Game.State.Time.minute = 0;
            Game.State.Time.secondsTowardNextMinute = Game.Get<ClockSettings>().secondsPerInGameMinute;
            _clock.Advance(0f);
            Assert.That(Game.State.Time.minute, Is.EqualTo(10));
        }

        [Test]
        public void CancellingAfterTheDailyUpdateKeepsTheNewDayAndReleasesControls()
        {
            NextYield();
            DOTween.Complete(_canvas, true);
            NextYield();
            ((IDisposable)_routine).Dispose();
            Assert.That(Game.State.Time.daysSinceStart, Is.EqualTo(6));
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
            child.transform.SetParent(Game.Root.transform);
            return child;
        }

    }
}

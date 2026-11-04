using System;
using System.Collections.Generic;
using System.Reflection;
using Core.Common.Editor;
using Core.Events;
using Core.Game;
using Core.Scripting;
using Core.TimeAndWeather.Seasons;
using NUnit.Framework;
using static Core.Common.Editor.Reflect;

namespace Core.TimeAndWeather.Editor
{
    /// <summary>
    /// Exercises calendar progression as a plain service: no canvas, character, weather volume or Unity callbacks.
    /// The clock runs with the authored settings from the SystemRoot, as in the game.
    /// </summary>
    public sealed class GameClockTests : ServiceTest
    {
        private ClockSettings _settings;
        private GameClock _clock;
        private ClockRecorder _recorder;

        [SetUp]
        public void SetUp()
        {
            _settings = Game.Get<ClockSettings>();
            _clock = Game.Clock;
            _recorder = new ClockRecorder(_clock);
        }

        [TearDown]
        public void TearDown() => _recorder.Dispose();

        private GameTimeState Time => Game.State.Time;
        private float Step => _settings.secondsPerInGameMinute;

        [Test]
        public void FirstStartBeginsTheConfiguredDayWithoutRaisingANewDay()
        {
            _clock.Start();

            Assert.That(Time.initialized, Is.True);
            Assert.That(Time.daysSinceStart, Is.EqualTo(1));
            Assert.That(Time.season, Is.EqualTo(_settings.startingSeason));
            Assert.That(Time.dayOfSeason, Is.EqualTo(_settings.startingDay));
            Assert.That((Time.hour, Time.minute), Is.EqualTo((_settings.startOfDay, 0)));
            Assert.That(_clock.CurrentSeason.season, Is.EqualTo(_settings.startingSeason));
            Assert.That(_recorder.NewDays, Is.Empty);
            Assert.That(_recorder.Refreshes, Has.Count.EqualTo(1));
            Assert.That(_recorder.Refreshes[0].Progress, Is.Zero);
        }

        [Test]
        public void StartingFromASavedClockKeepsItsSeasonAndTime()
        {
            var summer = _settings.seasons[1];
            Time.initialized = true;
            Time.season = summer.season;
            Time.dayOfSeason = 9;
            Time.hour = 15;

            _clock.Start();

            Assert.That(_clock.CurrentSeason, Is.SameAs(summer));
            Assert.That((Time.dayOfSeason, Time.hour), Is.EqualTo((9, 15)));
            Assert.That(_recorder.Refreshes[0].Season, Is.SameAs(summer));
        }

        [Test]
        public void SecondsAccumulateIntoTenMinuteStepsAndPublishEachChange()
        {
            _clock.Start();

            _clock.Advance(Step * 2.5f);

            Assert.That(Time.minute, Is.EqualTo(20));
            Assert.That(Time.secondsTowardNextMinute, Is.EqualTo(Step * 0.5f).Within(0.001f));
            Assert.That(_recorder.TimeChanges, Is.EqualTo(new[] { Time.TotalMinutes }));
            Assert.That(_recorder.DaylightChanges, Is.Empty, "Daylight follows the hour, not each step.");

            _clock.Advance(Step * 0.25f);
            Assert.That(_recorder.TimeChanges, Has.Count.EqualTo(1), "Partial progress is not a clock change.");
        }

        [Test]
        public void CrossingAnHourRefreshesDaylightOnce()
        {
            _clock.Start();

            _clock.Advance(Step * 6);

            Assert.That((Time.hour, Time.minute), Is.EqualTo((_settings.startOfDay + 1, 0)));
            Assert.That(_recorder.DaylightChanges, Is.EqualTo(new[] { _clock.DayProgress }));
            Assert.That(_clock.DayProgress, Is.EqualTo(1f / (_settings.endOfDay - _settings.startOfDay)).Within(0.0001f));
        }

        [Test]
        public void EachPauseOwnerHoldsTheClockIndependently()
        {
            _clock.Start();
            var menu = new object();
            var cutscene = new object();
            _clock.Pause(menu);
            _clock.Pause(cutscene);

            _clock.Advance(Step * 6);
            Assert.That(Time.minute, Is.Zero);

            _clock.Resume(menu);
            Assert.That(_clock.IsPaused, Is.True);
            _clock.Advance(Step);
            Assert.That(Time.minute, Is.Zero);

            _clock.Resume(cutscene);
            _clock.Advance(Step);
            Assert.That(Time.minute, Is.EqualTo(10));
        }

        [Test]
        public void PausingTwiceForOneOwnerNeedsOnlyOneResume()
        {
            _clock.Start();
            var owner = new object();
            _clock.Pause(owner);
            _clock.Pause(owner);
            _clock.Resume(owner);
            Assert.That(_clock.IsPaused, Is.False);
        }

        [Test]
        public void TheOvernightSequenceHoldsTheCalendarWithoutAccumulatingTime()
        {
            _clock.Start();
            _clock.BeginOvernight();

            _clock.Advance(1000f);

            Assert.That(Time.secondsTowardNextMinute, Is.Zero);
            Assert.That((Time.hour, Time.minute), Is.EqualTo((_settings.startOfDay, 0)));
            Assert.That(() => _clock.BeginOvernight(), Throws.InvalidOperationException);

            _clock.EndOvernight();
            _clock.Advance(Step);
            Assert.That(Time.minute, Is.EqualTo(10));
        }

        [Test]
        public void PassingBedtimeRequestsTheNightUntilTheNextDayStarts()
        {
            _clock.Start();
            Time.hour = _settings.endOfDay - 1;
            Time.minute = 50;
            var bedtimes = 0;
            _clock.BedtimeReached += () => bedtimes++;

            _clock.Advance(Step);
            Assert.That(bedtimes, Is.EqualTo(1));
            Assert.That(Time.hour, Is.EqualTo(_settings.endOfDay));
            Assert.That(_recorder.TimeChanges, Is.Empty, "The next morning's clock is published by the new day.");

            _clock.Advance(0.1f);
            Assert.That(bedtimes, Is.EqualTo(2), "Bedtime is requested again while the night has not started.");

            _clock.StartNewDay();
            _clock.Advance(Step);
            Assert.That(bedtimes, Is.EqualTo(2));
        }

        [Test]
        public void StartingANewDayRollsConditionsBeforeTheDailyEvent()
        {
            _clock.Start();
            _recorder.Refreshes.Clear();
            _recorder.RefreshesSeenByNewDay = -1;

            _clock.StartNewDay();

            Assert.That(Time.daysSinceStart, Is.EqualTo(2));
            Assert.That(Time.dayOfSeason, Is.EqualTo(_settings.startingDay + 1));
            Assert.That((Time.hour, Time.minute), Is.EqualTo((_settings.startOfDay, 0)));
            Assert.That(_recorder.NewDays, Is.EqualTo(new[] { 2 }));
            Assert.That(_recorder.RefreshesSeenByNewDay, Is.EqualTo(1),
                "Daily listeners must see the new conditions regardless of subscription order.");
            Assert.That(_recorder.TimeChanges, Is.EqualTo(new[] { Time.TotalMinutes }));
        }

        [Test]
        public void TheLastDayOfASeasonRollsIntoTheNextSeasonInCalendarOrder()
        {
            _clock.Start();
            Time.dayOfSeason = _settings.numberOfDaysInSeason;
            var seasonStarts = new List<Season>();
            using var listener = new SeasonListener(seasonStarts);

            _clock.StartNewDay();

            Assert.That(_clock.CurrentSeason, Is.SameAs(_settings.seasons[1]));
            Assert.That((Time.season, Time.dayOfSeason), Is.EqualTo((_settings.seasons[1].season, 1)));
            Assert.That(seasonStarts, Is.EqualTo(new[] { _settings.seasons[1].season }));
        }

        [Test]
        public void TheCalendarWrapsFromTheFinalSeasonToTheFirst()
        {
            _clock.Start();
            _clock.StartSeason(_settings.seasons[^1].season);
            Time.dayOfSeason = _settings.numberOfDaysInSeason;

            _clock.StartNewDay();

            Assert.That(_clock.CurrentSeason, Is.SameAs(_settings.seasons[0]));
        }

        [Test]
        public void ApplyingSavedTimeBeforeStartDefersToStart()
        {
            _clock.ApplySavedTime();
            Assert.That(_recorder.Refreshes, Is.Empty);
        }

        [Test]
        public void ApplyingSavedTimeUsesTheRestoredSeasonWithoutStartingANewDay()
        {
            _clock.Start();
            _recorder.Refreshes.Clear();
            var restored = _settings.seasons[1].season;
            Time.season = restored;
            Time.dayOfSeason = 7;
            Time.hour = 15;
            var minutes = Time.TotalMinutes;

            _clock.ApplySavedTime();

            Assert.That(_clock.CurrentSeason.season, Is.EqualTo(restored));
            Assert.That(_recorder.Refreshes, Has.Count.EqualTo(1));
            Assert.That(Time.TotalMinutes, Is.EqualTo(minutes));
            Assert.That(_recorder.NewDays, Is.Empty);
        }

        [Test]
        public void SetTimeOfDayMovesForwardOnlyAndPublishesTheChange()
        {
            _clock.Start();
            Time.secondsTowardNextMinute = 3;

            _clock.SetTimeOfDay(18, 30);

            Assert.That((Time.hour, Time.minute), Is.EqualTo((18, 30)));
            Assert.That(Time.secondsTowardNextMinute, Is.Zero);
            Assert.That(_recorder.TimeChanges, Is.EqualTo(new[] { Time.TotalMinutes }));
            Assert.That(_recorder.DaylightChanges, Has.Count.EqualTo(1));
            Assert.That(() => _clock.SetTimeOfDay(18, 29), Throws.InvalidOperationException);
            _clock.SetTimeOfDay(18, 30);
            Assert.That(_recorder.TimeChanges, Has.Count.EqualTo(1), "Setting the same time is not a change.");
        }

        [Test]
        public void ScriptedChangesAreRefusedBeforeStartAndDuringTheOvernightSequence()
        {
            Assert.That(() => _clock.SetTimeOfDay(10, 0), Throws.InvalidOperationException);
            _clock.Start();
            _clock.BeginOvernight();
            Assert.That(() => _clock.SetTimeOfDay(10, 0), Throws.InvalidOperationException);
            Assert.That(() => _clock.RequireScriptTimeChange(), Throws.InvalidOperationException);
            _clock.EndOvernight();
            Assert.That(() => _clock.SetTimeOfDay(10, 0), Throws.Nothing);
        }

        [Test]
        public void ScriptedChangesRejectTimesOutsideThePlayableDay()
        {
            _clock.Start();
            Assert.That(() => _clock.ValidateTimeOfDay(_settings.startOfDay - 1, 59), Throws.TypeOf<ArgumentOutOfRangeException>());
            Assert.That(() => _clock.ValidateTimeOfDay(_settings.endOfDay, 0), Throws.TypeOf<ArgumentOutOfRangeException>());
            Assert.That(() => _clock.ValidateTimeOfDay(_settings.endOfDay - 1, 60), Throws.TypeOf<ArgumentOutOfRangeException>());
            Assert.That(() => _clock.ValidateTimeOfDay(_settings.endOfDay - 1, 59), Throws.Nothing);
        }

        [Test]
        public void NextBoundaryIsAlwaysInTheFutureAtMorning()
        {
            _clock.Start();
            Assert.That(_clock.GetNextBoundaryMinute(GameTimeBoundary.NextDay),
                Is.EqualTo(Time.TotalMinutes + 24 * 60));
        }

        [Test]
        public void InvalidSettingsFailWhenTheClockIsComposed()
        {
            Assert.That(() => new GameClock(Game.State, new ClockSettings()), Throws.InvalidOperationException);
            var invalid = new ClockSettings { seasons = _settings.seasons, endOfDay = _settings.startOfDay };
            Assert.That(() => new GameClock(Game.State, invalid), Throws.InvalidOperationException);
            var duplicate = new ClockSettings { seasons = new[] { _settings.seasons[0], _settings.seasons[0] } };
            Assert.That(() => new GameClock(Game.State, duplicate), Throws.InvalidOperationException);
        }

        [Test]
        public void LuaTimeQueriesAreDetachedReadOnlyAndReadTheCurrentSaveRoot()
        {
            var engine = Game.Lua.CreateEngine();
            Assert.That(() => engine.EvaluateCondition("Time.GetCurrent().hour == 6"), Throws.Exception);
            _clock.Start();
            Assert.That(engine.EvaluateCondition($"Time.GetCurrent().season == '{_settings.startingSeason}' and Time.GetCurrent().dayOfSeason == {_settings.startingDay}"), Is.True);
            engine.Execute("local now = Time.GetCurrent(); now.hour = 22");
            Assert.That(Time.hour, Is.EqualTo(_settings.startOfDay));
            Assert.That(() => engine.EvaluateCondition("Time.SetTime(18, 30)"), Throws.Exception);
            var replacement = new GameSaveData();
            replacement.time.initialized = true;
            replacement.time.hour = 15;
            replacement.time.daysSinceStart = 3;
            replacement.time.season = _settings.startingSeason;
            replacement.time.dayOfSeason = 7;
            Call(Game.State, "Restore", replacement);
            Assert.That(engine.EvaluateCondition("Time.GetCurrent().hour == 15 and Time.GetCurrent().totalMinutes == 3780"), Is.True);
        }

        [TestCase(-1, 0)]
        [TestCase(24, 0)]
        [TestCase(18.5, 0)]
        [TestCase(18, 60)]
        [TestCase(18, -1)]
        [TestCase(18, 0.5)]
        [TestCase(double.NaN, 0)]
        [TestCase(18, double.PositiveInfinity)]
        [TestCase(5, 59)]
        [TestCase(23, 0)]
        public void LuaTimeRejectsInvalidClockInputsWithoutChangingState(double hour, double minute)
        {
            _clock.Start();
            var previous = Time.TotalMinutes;
            var api = Game.Inject(new TimeLuaApi());
            Assert.That(() => api.SetTime(hour, minute), Throws.TypeOf<ArgumentOutOfRangeException>());
            Assert.That(Time.TotalMinutes, Is.EqualTo(previous));
            Assert.That(_recorder.TimeChanges, Is.Empty);
        }

        [Test]
        public void LuaTimeRejectsUninitializedAndTransitioningClocksAndNeverRewinds()
        {
            var api = Game.Inject(new TimeLuaApi());
            Assert.That(() => api.StartNewDay(), Throws.InvalidOperationException);
            _clock.Start();
            Game.Lua.CreateEngine().Execute("Time.SetTime(18, 30)");
            Assert.That(() => api.SetTime(18, 29), Throws.InvalidOperationException);
            var previous = Time.TotalMinutes;
            _clock.BeginOvernight();
            Assert.That(() => api.SetTime(19, 0), Throws.InvalidOperationException);
            Assert.That(() => api.StartNewDay(), Throws.InvalidOperationException);
            _clock.EndOvernight();
            api.SetTime(18, 30);
            Assert.That(Time.TotalMinutes, Is.EqualTo(previous));
            Assert.That(_recorder.TimeChanges, Has.Count.EqualTo(1));
        }

        /// <summary>Records everything the clock announces, without presentation systems.</summary>
        private sealed class ClockRecorder : IDisposable, IEventListener<GameTimeChangedEvent>, IEventListener<NewDayEvent>
        {
            private readonly GameClock _clock;
            public readonly List<(SeasonData Season, float Progress)> Refreshes = new();
            public readonly List<float> DaylightChanges = new();
            public readonly List<long> TimeChanges = new();
            public readonly List<int> NewDays = new();
            public int RefreshesSeenByNewDay;

            public ClockRecorder(GameClock clock)
            {
                _clock = clock;
                clock.ConditionsRefreshed += OnRefreshed;
                clock.DaylightAdvanced += DaylightChanges.Add;
                EventBus<GameTimeChangedEvent>.Subscribe(this);
                EventBus<NewDayEvent>.Subscribe(this);
            }

            private void OnRefreshed(SeasonData season, float progress) => Refreshes.Add((season, progress));
            public void OnEvent(GameTimeChangedEvent change) => TimeChanges.Add(change.TotalMinutes);

            public void OnEvent(NewDayEvent change)
            {
                NewDays.Add(change.Day);
                RefreshesSeenByNewDay = Refreshes.Count;
            }

            public void Dispose()
            {
                _clock.ConditionsRefreshed -= OnRefreshed;
                _clock.DaylightAdvanced -= DaylightChanges.Add;
                EventBus<GameTimeChangedEvent>.Unsubscribe(this);
                EventBus<NewDayEvent>.Unsubscribe(this);
            }
        }

        private sealed class SeasonListener : IDisposable
        {
            private readonly List<Season> _starts;

            public SeasonListener(List<Season> starts)
            {
                _starts = starts;
                SeasonStartEvent.Register((SeasonStartEvent.Delegate)OnSeasonStarted);
            }

            private void OnSeasonStarted(SeasonData season) => _starts.Add(season.season);
            public void Dispose() => SeasonStartEvent.Unregister((SeasonStartEvent.Delegate)OnSeasonStarted);
        }
    }
}

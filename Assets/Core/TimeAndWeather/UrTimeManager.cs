using VContainer;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Core.Game;
using Core.Events;
using Core.Location;
using Core.TimeAndWeather.Seasons;
using UnityEngine;
using UI.Shared;

namespace Core.TimeAndWeather
{
    /// <summary>Advances the game calendar and coordinates the ordered overnight transition.</summary>
    public class UrTimeManager : Core.GameManager
    {
        [Inject] private GameState _gameState;

        [Inject] private WeatherManager _weatherManager;
        [Inject] private LevelManager _levelManager;
        [Inject] private CharacterManager _characterManager;
        [Inject] private UrGUIManager _urGUIManager;

        [Header("Time Settings")] [SerializeField]
        protected Season startingSeason = Season.Spring;

        [SerializeField] protected int startingDay = 5;
        [SerializeField] protected int startOfDay = 6;
        [SerializeField] protected int endOfDay = 23;
        [SerializeField] protected int numberOfDaysInSeason = 14;
        [SerializeField] protected float secondsPerInGameMinute = 10f; // TODO: Probably wrong? Seems too fast

        [Header("Day transition")]
        [SerializeField, Min(0f)] private float dayBlackoutDuration = 0.6f;
        [Tooltip("Optional sound played while the screen is covered.")]
        [SerializeField] private AudioClip newDayJingle;

        [Header("Seasons")] [SerializeField] protected SeasonData[] seasons;

        private Dictionary<Season, SeasonData> _seasonDataDict;
        private SeasonData _currentSeason;
        private GameCalendar _calendar;
        private IEnumerator _dayTransitionRoutine;

        private GameCalendar Calendar => _calendar ??= new GameCalendar(
            startOfDay, numberOfDaysInSeason, seasons.Select(data => data.season).ToArray());

        public long GetNextBoundaryMinute(GameTimeBoundary boundary) =>
            Calendar.GetNextBoundaryMinute(_gameState.Time, boundary);

        /// <summary>The current season's authored conditions, in the configured calendar order.</summary>
        public SeasonData CurrentSeason => _currentSeason;

        /// <summary>Progress from morning to bedtime, used to sample the daylight gradient.</summary>
        public float DayProgress => (float)(_gameState.Time.hour - startOfDay) / (endOfDay - startOfDay);

        public UrTime CurrentTime
        {
            get
            {
                var time = _gameState.Time;
                return new UrTime(time.season, time.dayOfSeason, time.hour, time.minute);
            }
        }

        public void Start()
        {
            _seasonDataDict = seasons.ToDictionary(d => d.season);

            var time = _gameState.Time;
            if (time.initialized)
            {
                _currentSeason = _seasonDataDict[time.season];
            }
            else
            {
                // The starting date is not a day transition: existing plants must not grow.
                time.daysSinceStart = 1;
                StartSeason(startingSeason);
                time.dayOfSeason = startingDay;
                time.hour = startOfDay;
                time.minute = 0;
                time.secondsTowardNextMinute = 0f;
                time.initialized = true;
            }

            _weatherManager.RefreshConditions(_currentSeason, DayProgress);
            _started = true;
        }

        private bool _started;

        internal void RequireScriptTimeChange()
        {
            if (!_started)
                throw new System.InvalidOperationException("Scripted time changes require the initialized UrTimeManager.");
            if (_dayTransitionRoutine != null)
                throw new System.InvalidOperationException("Cannot change scripted time during an overnight transition.");
        }

        public void ValidateTimeOfDay(int hour, int minute)
        {
            RequireScriptTimeChange();
            if (hour < startOfDay || hour >= endOfDay || minute < 0 || minute >= 60)
                throw new System.ArgumentOutOfRangeException(nameof(hour),
                    $"Time must be between {startOfDay:00}:00 and {endOfDay - 1:00}:59.");
        }

        /// <summary>Moves forward within the current day, refreshing daylight and clock-driven cooldowns.</summary>
        public void SetTimeOfDay(int hour, int minute)
        {
            ValidateTimeOfDay(hour, minute);
            var time = _gameState.Time;
            if (hour * 60 + minute < time.hour * 60 + time.minute)
                throw new System.InvalidOperationException("The game clock cannot rewind. Start a new day before selecting an earlier time.");
            var previousMinute = time.TotalMinutes;
            time.hour = hour;
            time.minute = minute;
            time.secondsTowardNextMinute = 0f;
            _weatherManager.UpdateDaylight(DayProgress);
            if (time.TotalMinutes != previousMinute)
                GameTimeChangedEvent.Trigger(time.TotalMinutes);
        }

        /// <summary>Refreshes runtime conditions after GameState.Load, without advancing time.</summary>
        public void ApplySavedTime()
        {
            if (!_started) return; // Start will read the restored state instead.
            _currentSeason = _seasonDataDict[_gameState.Time.season];
            _weatherManager.RefreshConditions(_currentSeason, DayProgress);
        }

        protected void Update()
        {
            // Modal screens pause the calendar without changing gameplay time-scale requests.
            if (_dayTransitionRoutine != null || _urGUIManager.IsGameClockPaused) return;

            var time = _gameState.Time;
            var previousMinute = time.TotalMinutes;
            float deltaTime = Time.deltaTime;
            time.secondsTowardNextMinute += deltaTime;

            // Instead of advancing minutes by 1, advance in 10-minute increments.
            if (time.secondsTowardNextMinute >= secondsPerInGameMinute)
            {
                int increments = Mathf.FloorToInt(time.secondsTowardNextMinute / secondsPerInGameMinute);
                // Each increment represents 10 in-game minutes
                time.minute += 10 * increments;
                time.secondsTowardNextMinute -= increments * secondsPerInGameMinute;
            }

            // Handle minute overflow into hours (may add multiple hours)
            if (time.minute >= 60)
            {
                int hoursToAdd = time.minute / 60;
                time.minute %= 60;
                time.hour += hoursToAdd;
                _weatherManager.UpdateDaylight(DayProgress);
            }

            if (time.hour >= endOfDay)
            {
                EndDay(DayEndReason.PassedOut);
                return; // The transition publishes the next morning's clock after fading to black.
            }
            if (time.TotalMinutes != previousMinute)
                GameTimeChangedEvent.Trigger(time.TotalMinutes);
        }

        /// <summary>Fades through the next morning, stopping the clock and player controls during the transition.</summary>
        public void EndDay(DayEndReason reason = DayEndReason.Sleep)
        {
            if (_dayTransitionRoutine != null || !_levelManager.SceneReady) return;
            var character = _characterManager.MainCharacter;
            if (!character)
                throw new System.InvalidOperationException("Ending the day requires a registered main character.");
            _dayTransitionRoutine = TransitionToNextDay(character, reason, _gameState.Time.hour);
            StartCoroutine(_dayTransitionRoutine);
        }

        private IEnumerator TransitionToNextDay(Character.MainCharacter character, DayEndReason reason, int bedtimeHour)
        {
            var gui = _urGUIManager;
            try
            {
                gui.TransitionInterrupted += CancelDayTransition;
                EventBus<DayTransitionStarted>.Raise(new DayTransitionStarted(character));
                try
                {
                    if (reason == DayEndReason.PassedOut)
                        yield return character.Animator.PlayInteractionAnimation(character.PassOutAnimation);
                    yield return gui.CoverScene(character.transform);
                }
                finally { character.Animator.EndInteractionAnimation(); }
                yield return _levelManager.ReturnHome(character);
                // NewDayEvent listeners run only after the screen is completely covered.
                StartNewDay();
                // Recovery follows clock-driven expirations and only occurs once the overnight advance succeeds.
                EventBus<OvernightRestCompleted>.Raise(new OvernightRestCompleted(character, reason, bedtimeHour));
                yield return gui.RevealScene(character.transform, dayBlackoutDuration, newDayJingle);
            }
            finally
            {
                try
                {
                    gui.TransitionInterrupted -= CancelDayTransition;
                    gui.ResetTransition();
                    EventBus<DayTransitionFinished>.Raise(new DayTransitionFinished(character));
                }
                finally { _dayTransitionRoutine = null; }
            }
        }

        /// <summary>Cancels the overnight sequence and releases its listeners' transition state.</summary>
        public void CancelDayTransition()
        {
            if (_dayTransitionRoutine == null) return;
            var routine = _dayTransitionRoutine;
            StopCoroutine(routine);
            // Stop scheduling first, then dispose this compiler-generated iterator to run its pending finally.
            // Stopping a Unity coroutine alone is not a cleanup contract for its suspended iterator.
            ((System.IDisposable)routine).Dispose();
        }

        /// <summary>Advances the calendar and daily systems immediately; normal bedtime uses EndDay.</summary>
        public void StartNewDay()
        {
            var time = _gameState.Time;
            time.daysSinceStart++;
            time.hour = startOfDay;
            time.minute = 0;
            time.secondsTowardNextMinute = 0f;
            if (time.dayOfSeason >= numberOfDaysInSeason)
            {
                StartSeason(Calendar.GetNextSeason(time.season));
                time.dayOfSeason = 1;
            }
            else
            {
                time.dayOfSeason++;
            }

            // Daily listeners must see the new weather, regardless of their event subscription order.
            _weatherManager.RefreshConditions(_currentSeason, DayProgress);
            NewDayEvent.Trigger(time.daysSinceStart);
            GameTimeChangedEvent.Trigger(time.TotalMinutes);
            Debug.Log($"Starting {time.season} day {time.dayOfSeason} at {time.hour:00}:{time.minute:00} (game day {time.daysSinceStart}).");
        }

        public void StartSeason(Season season)
        {
            var time = _gameState.Time;
            time.dayOfSeason = 0;
            time.season = season;
            _currentSeason = _seasonDataDict[season];
            SeasonStartEvent.Trigger(_currentSeason);
        }

        protected override void OnDisable() { base.OnDisable(); CancelDayTransition(); }
    }
}

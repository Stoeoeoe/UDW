using System;
using System.Collections.Generic;
using System.Linq;
using Core.Events;
using Core.Game;
using Core.TimeAndWeather.Seasons;
using UnityEngine;
using VContainer.Unity;

namespace Core.TimeAndWeather
{
    /// <summary>
    /// Advances the saved game calendar. It knows nothing about fades, characters or weather presentation:
    /// consumers react to its events, and other systems stop it with <see cref="Pause"/>.
    /// </summary>
    public sealed class GameClock : IStartable, ITickable
    {
        private readonly GameState _gameState;
        private readonly ClockSettings _settings;
        private readonly Dictionary<Season, SeasonData> _seasons;
        private readonly GameCalendar _calendar;
        private readonly HashSet<object> _pauses = new();
        private SeasonData _currentSeason;
        private bool _started;

        public GameClock(GameState gameState, ClockSettings settings)
        {
            settings.Validate();
            _gameState = gameState;
            _settings = settings;
            _seasons = settings.seasons.ToDictionary(data => data.season);
            _calendar = new GameCalendar(settings.startOfDay, settings.numberOfDaysInSeason,
                settings.seasons.Select(data => data.season).ToArray());
        }

        /// <summary>Raised when the season's conditions must be rolled again: startup, loading a save and each new day.</summary>
        public event Action<SeasonData, float> ConditionsRefreshed;

        /// <summary>Raised when the hour advances without a new roll, with the new progress through the day.</summary>
        public event Action<float> DaylightAdvanced;

        /// <summary>Raised while the clock runs past the end of the playable day, until someone starts the next one.</summary>
        public event Action BedtimeReached;

        /// <summary>The current season's authored conditions, in the configured calendar order.</summary>
        public SeasonData CurrentSeason => _currentSeason;

        /// <summary>Progress from morning to bedtime, used to sample the daylight gradient.</summary>
        public float DayProgress =>
            (float)(_gameState.Time.hour - _settings.startOfDay) / (_settings.endOfDay - _settings.startOfDay);

        public UrTime CurrentTime
        {
            get
            {
                var time = _gameState.Time;
                return new UrTime(time.season, time.dayOfSeason, time.hour, time.minute);
            }
        }

        /// <summary>Whether any owner, such as an open screen or cutscene, currently stops the clock.</summary>
        public bool IsPaused => _pauses.Count > 0;

        /// <summary>Whether the overnight sequence owns the calendar; scripted time changes are refused meanwhile.</summary>
        public bool IsOvernight { get; private set; }

        public long GetNextBoundaryMinute(GameTimeBoundary boundary) =>
            _calendar.GetNextBoundaryMinute(_gameState.Time, boundary);

        /// <summary>Stops time advancing until the same owner resumes it. Owners are independent.</summary>
        public void Pause(object owner) => _pauses.Add(owner);

        public void Resume(object owner) => _pauses.Remove(owner);

        /// <summary>Held by the overnight sequence for its whole duration, including when it is cancelled.</summary>
        public void BeginOvernight()
        {
            if (IsOvernight) throw new InvalidOperationException("An overnight transition is already running.");
            IsOvernight = true;
        }

        public void EndOvernight() => IsOvernight = false;

        public void Start()
        {
            var time = _gameState.Time;
            if (time.initialized)
            {
                _currentSeason = _seasons[time.season];
            }
            else
            {
                // The starting date is not a day transition: existing plants must not grow.
                time.daysSinceStart = 1;
                StartSeason(_settings.startingSeason);
                time.dayOfSeason = _settings.startingDay;
                time.hour = _settings.startOfDay;
                time.minute = 0;
                time.secondsTowardNextMinute = 0f;
                time.initialized = true;
            }

            _started = true;
            ConditionsRefreshed?.Invoke(_currentSeason, DayProgress);
        }

        /// <summary>Refreshes runtime conditions after GameState.Load, without advancing time.</summary>
        public void ApplySavedTime()
        {
            if (!_started) return; // Start will read the restored state instead.
            _currentSeason = _seasons[_gameState.Time.season];
            ConditionsRefreshed?.Invoke(_currentSeason, DayProgress);
        }

        public void RequireScriptTimeChange()
        {
            if (!_started)
                throw new InvalidOperationException("Scripted time changes require the started game clock.");
            if (IsOvernight)
                throw new InvalidOperationException("Cannot change scripted time during an overnight transition.");
        }

        public void ValidateTimeOfDay(int hour, int minute)
        {
            RequireScriptTimeChange();
            if (hour < _settings.startOfDay || hour >= _settings.endOfDay || minute < 0 || minute >= 60)
                throw new ArgumentOutOfRangeException(nameof(hour),
                    $"Time must be between {_settings.startOfDay:00}:00 and {_settings.endOfDay - 1:00}:59.");
        }

        /// <summary>Moves forward within the current day, refreshing daylight and clock-driven cooldowns.</summary>
        public void SetTimeOfDay(int hour, int minute)
        {
            ValidateTimeOfDay(hour, minute);
            var time = _gameState.Time;
            if (hour * 60 + minute < time.hour * 60 + time.minute)
                throw new InvalidOperationException("The game clock cannot rewind. Start a new day before selecting an earlier time.");
            var previousMinute = time.TotalMinutes;
            time.hour = hour;
            time.minute = minute;
            time.secondsTowardNextMinute = 0f;
            DaylightAdvanced?.Invoke(DayProgress);
            if (time.TotalMinutes != previousMinute)
                GameTimeChangedEvent.Trigger(time.TotalMinutes);
        }

        public void Tick() => Advance(Time.deltaTime);

        /// <summary>Accumulates real seconds into game time unless a pause or the overnight sequence holds the calendar.</summary>
        public void Advance(float deltaSeconds)
        {
            if (IsOvernight || IsPaused) return;

            var time = _gameState.Time;
            var previousMinute = time.TotalMinutes;
            time.secondsTowardNextMinute += deltaSeconds;

            // Instead of advancing minutes by 1, advance in 10-minute increments.
            if (time.secondsTowardNextMinute >= _settings.secondsPerInGameMinute)
            {
                var increments = Mathf.FloorToInt(time.secondsTowardNextMinute / _settings.secondsPerInGameMinute);
                time.minute += 10 * increments;
                time.secondsTowardNextMinute -= increments * _settings.secondsPerInGameMinute;
            }

            // Handle minute overflow into hours (may add multiple hours)
            if (time.minute >= 60)
            {
                time.hour += time.minute / 60;
                time.minute %= 60;
                DaylightAdvanced?.Invoke(DayProgress);
            }

            if (time.hour >= _settings.endOfDay)
            {
                BedtimeReached?.Invoke(); // The next morning's clock is published after the overnight fade.
                return;
            }
            if (time.TotalMinutes != previousMinute)
                GameTimeChangedEvent.Trigger(time.TotalMinutes);
        }

        /// <summary>Advances the calendar and daily systems immediately; normal bedtime uses the overnight transition.</summary>
        public void StartNewDay()
        {
            var time = _gameState.Time;
            time.daysSinceStart++;
            time.hour = _settings.startOfDay;
            time.minute = 0;
            time.secondsTowardNextMinute = 0f;
            if (time.dayOfSeason >= _settings.numberOfDaysInSeason)
            {
                StartSeason(_calendar.GetNextSeason(time.season));
                time.dayOfSeason = 1;
            }
            else
            {
                time.dayOfSeason++;
            }

            // Daily listeners must see the new weather, regardless of their event subscription order.
            ConditionsRefreshed?.Invoke(_currentSeason, DayProgress);
            NewDayEvent.Trigger(time.daysSinceStart);
            GameTimeChangedEvent.Trigger(time.TotalMinutes);
            Debug.Log($"Starting {time.season} day {time.dayOfSeason} at {time.hour:00}:{time.minute:00} (game day {time.daysSinceStart}).");
        }

        public void StartSeason(Season season)
        {
            var time = _gameState.Time;
            time.dayOfSeason = 0;
            time.season = season;
            _currentSeason = _seasons[season];
            SeasonStartEvent.Trigger(_currentSeason);
        }
    }
}

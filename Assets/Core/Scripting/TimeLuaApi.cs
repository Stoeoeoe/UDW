using VContainer;
using Preserve = UnityEngine.Scripting.PreserveAttribute;
using System;
using Core.Game;
using Core.TimeAndWeather;
using UnityEngine.Scripting;

namespace Core.Scripting
{
    [LuaTable]
    public sealed class TimeLuaView
    {
        [LuaField] public string season;
        [LuaField] public int dayOfSeason;
        [LuaField] public int daysSinceStart;
        [LuaField] public int hour;
        [LuaField] public int minute;
        [LuaField] public double totalMinutes;
    }

    [LuaModule("Time")]
    public sealed class TimeLuaApi
    {
        [Inject] private GameState _gameState;

        [Inject] private GameClock _clock;

        // Resolve live state on every call: loading replaces the save root.
        [LuaCall]
        public TimeLuaView GetCurrent()
        {
            var time = _gameState.Time;
            if (!time.initialized)
                throw new InvalidOperationException("Time queries require the initialized game calendar.");
            return new TimeLuaView
            {
                season = time.season.ToString(), dayOfSeason = time.dayOfSeason,
                daysSinceStart = time.daysSinceStart, hour = time.hour, minute = time.minute,
                totalMinutes = time.TotalMinutes
            };
        }

        [Preserve]
        public void ValidateSetTime(double hour, double minute)
        {
            if (!double.IsFinite(hour) || hour != Math.Truncate(hour) || hour < 0 || hour > 23)
                throw new ArgumentOutOfRangeException(nameof(hour), "Hour must be a whole number from 0 to 23.");
            if (!double.IsFinite(minute) || minute != Math.Truncate(minute) || minute < 0 || minute > 59)
                throw new ArgumentOutOfRangeException(nameof(minute), "Minute must be a whole number from 0 to 59.");
            Clock.ValidateTimeOfDay((int)hour, (int)minute);
        }

        [LuaCall(writesState: true)]
        [LuaAction("time.setTime", "Set time of day", "Time", "Move forward within the current day; refresh daylight and cooldowns.",
            "cutscene", Validator = nameof(ValidateSetTime), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        public void SetTime(double hour, double minute)
        {
            ValidateSetTime(hour, minute);
            Clock.SetTimeOfDay((int)hour, (int)minute);
        }

        [Preserve] public void ValidateStartNewDay() => Clock.RequireScriptTimeChange();

        [LuaCall(writesState: true)]
        [LuaAction("time.startNewDay", "Start new day", "Time", "Advance to the next morning and process daily systems immediately, without the bedtime sequence.",
            "cutscene", Validator = nameof(ValidateStartNewDay), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        public void StartNewDay()
        {
            ValidateStartNewDay();
            Clock.StartNewDay();
        }

        // This is the Lua boundary; default modules are also inspected without a live scene.
        private GameClock Clock => _clock;
    }
}

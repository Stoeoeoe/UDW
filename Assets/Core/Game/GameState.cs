using System;
using System.Collections.Generic;
using Character;
using Core.Divinity;
using Core.TimeAndWeather;

namespace Core.Game
{
    /// <summary>Convenient access to the state of the current game session.</summary>
    public static class GameState
    {
        private static GameStateManager Manager => GameStateManager.Instance
            ? GameStateManager.Instance
            : throw new InvalidOperationException("GameState is unavailable until SystemRoot has initialized.");

        public static WorldState World => Manager.World;
        public static PlayerState Player => Manager.Player;
        public static StoryState Story => Manager.Story;
        public static GameTimeState Time => Manager.Time;
        public static void Save(string slot) => Manager.Save(slot);
        public static bool Load(string slot) => Manager.Load(slot);
    }

    public sealed class PlayerState
    {
        public CharacterSkills Skills { get; } = new CharacterSkills();
        public DivineFavourState Favour { get; } = new DivineFavourState();
    }

    [Serializable]
    public sealed class GameTimeState
    {
        public bool initialized;
        public int daysSinceStart;
        public Season season;
        public int dayOfSeason;
        public int hour;
        public int minute;
        public float secondsTowardNextMinute;

        internal GameTimeState Capture() => new GameTimeState
        {
            initialized = initialized,
            daysSinceStart = daysSinceStart,
            season = season,
            dayOfSeason = dayOfSeason,
            hour = hour,
            minute = minute,
            secondsTowardNextMinute = secondsTowardNextMinute
        };

        internal void Restore(GameTimeState saved)
        {
            initialized = saved.initialized;
            daysSinceStart = saved.daysSinceStart;
            season = saved.season;
            dayOfSeason = saved.dayOfSeason;
            hour = saved.hour;
            minute = saved.minute;
            secondsTowardNextMinute = saved.secondsTowardNextMinute;
        }
    }

    public sealed class StoryState
    {
        private readonly HashSet<string> _flags = new HashSet<string>(StringComparer.Ordinal);

        public bool HasFlag(string flag) => _flags.Contains(flag);

        public bool SetFlag(string flag) => _flags.Add(flag);

        public bool ClearFlag(string flag) => _flags.Remove(flag);

        internal IEnumerable<string> GetFlags() => _flags;

        internal void RestoreFlags(IEnumerable<string> flags)
        {
            _flags.Clear();
            foreach (var flag in flags)
                _flags.Add(flag);
        }
    }
}

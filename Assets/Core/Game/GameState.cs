using System;
using System.Collections.Generic;
using Character;
using Core.Divinity;
using Core.TimeAndWeather;
using Sirenix.Serialization;

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

    [Serializable]
    public sealed class PlayerState
    {
        [field: OdinSerialize] public CharacterSkills Skills { get; private set; } = new CharacterSkills();
        [field: OdinSerialize] public DivineFavourState Favour { get; private set; } = new DivineFavourState();
        public bool StaminaInitialized;
        public int CurrentStamina;
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
    }

    [Serializable]
    public sealed class StoryState
    {
        [OdinSerialize] private HashSet<string> _flags = new HashSet<string>(StringComparer.Ordinal);

        public bool HasFlag(string flag) => _flags.Contains(flag);

        public bool SetFlag(string flag) => _flags.Add(flag);

        public bool ClearFlag(string flag) => _flags.Remove(flag);

        internal IEnumerable<string> GetFlags() => _flags;
    }
}

using System;
using System.Collections.Generic;

namespace Core.Game
{
    /// <summary>The persisted game state. Runtime services operate on these sections directly.</summary>
    [Serializable]
    public sealed class GameSaveData
    {
        public const int CurrentVersion = 1;

        public int schemaVersion = CurrentVersion;
        public int worldBaselineVersion = 1;
        public PlayerState player = new();
        public StoryState story = new();
        public GameTimeState time = new();
        public WorldState world = new();

        public void Validate()
        {
            if (schemaVersion != CurrentVersion)
                throw new NotSupportedException($"Save schema version {schemaVersion} is not supported (expected {CurrentVersion}).");
            if (worldBaselineVersion < 1)
                throw new FormatException("The save is missing its world baseline version.");
            if (player?.Skills?.GetLevels() == null || player.Favour?.GetScores() == null ||
                story?.GetFlags() == null || time == null || world?.GetLocations() == null)
                throw new FormatException("The save is missing a required state section.");

            if (!time.initialized || time.daysSinceStart < 1 ||
                !Enum.IsDefined(typeof(Core.TimeAndWeather.Season), time.season) ||
                time.dayOfSeason < 1 || time.hour < 0 || time.hour > 23 ||
                time.minute < 0 || time.minute > 59 ||
                float.IsNaN(time.secondsTowardNextMinute) || float.IsInfinity(time.secondsTowardNextMinute) ||
                time.secondsTowardNextMinute < 0)
                throw new FormatException("The save contains invalid game time.");

            foreach (var skill in player.Skills.GetLevels())
                if (string.IsNullOrWhiteSpace(skill.Key) || skill.Value < 0)
                    throw new FormatException("The save contains an invalid skill level.");

            foreach (var pair in player.Favour.GetScores())
                Core.Divinity.DeityDefinitions.ValidateId(pair.Key);

            var storyFlags = new HashSet<string>(StringComparer.Ordinal);
            foreach (var flag in story.GetFlags())
                if (string.IsNullOrWhiteSpace(flag) || !storyFlags.Add(flag))
                    throw new FormatException("The save contains an invalid or duplicate story flag.");

            foreach (var location in world.GetLocations())
            {
                if (string.IsNullOrWhiteSpace(location.Key) || location.Value == null)
                    throw new FormatException("The save contains an invalid world location.");
                foreach (var obj in location.Value)
                    if (string.IsNullOrWhiteSpace(obj.Key) || obj.Value == null)
                        throw new FormatException("The save contains an invalid world object.");
            }
        }
    }

}

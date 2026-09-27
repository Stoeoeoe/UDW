using System;
using System.Collections.Generic;

namespace Core.Game
{
    /// <summary>Versioned, plain-data snapshot. </summary>
    [Serializable]
    public sealed class GameSaveData
    {
        public const int CurrentVersion = 1;

        public int schemaVersion;
        public int worldBaselineVersion;
        public PlayerSaveData player;
        public StorySaveData story;
        public GameTimeState time;
        public WorldSaveData world;

        public void Validate()
        {
            if (schemaVersion != CurrentVersion)
                throw new NotSupportedException($"Save schema version {schemaVersion} is not supported (expected {CurrentVersion}).");
            if (worldBaselineVersion < 1)
                throw new FormatException("The save is missing its world baseline version.");
            if (player?.skills == null || story?.flags == null || time == null || world?.locations == null)
                throw new FormatException("The save is missing a required state section.");

            if (!time.initialized || time.daysSinceStart < 1 ||
                !Enum.IsDefined(typeof(Core.TimeAndWeather.Season), time.season) ||
                time.dayOfSeason < 1 || time.hour < 0 || time.hour > 23 ||
                time.minute < 0 || time.minute > 59 ||
                float.IsNaN(time.secondsTowardNextMinute) || float.IsInfinity(time.secondsTowardNextMinute) ||
                time.secondsTowardNextMinute < 0)
                throw new FormatException("The save contains invalid game time.");

            var skillIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var skill in player.skills)
                if (skill == null || string.IsNullOrWhiteSpace(skill.id) || skill.level < 0 || !skillIds.Add(skill.id))
                    throw new FormatException("The save contains an invalid or duplicate skill level.");

            var storyFlags = new HashSet<string>(StringComparer.Ordinal);
            foreach (var flag in story.flags)
                if (string.IsNullOrWhiteSpace(flag) || !storyFlags.Add(flag))
                    throw new FormatException("The save contains an invalid or duplicate story flag.");

            foreach (var location in world.locations)
            {
                if (string.IsNullOrWhiteSpace(location.Key) || location.Value == null)
                    throw new FormatException("The save contains an invalid world location.");
                foreach (var obj in location.Value)
                    if (string.IsNullOrWhiteSpace(obj.Key) || obj.Value == null)
                        throw new FormatException("The save contains an invalid world object.");
            }
        }
    }

    [Serializable]
    public sealed class PlayerSaveData
    {
        public List<SkillLevelRecord> skills = new();
    }

    [Serializable]
    public sealed class SkillLevelRecord
    {
        public string id;
        public int level;
    }

    [Serializable]
    public sealed class StorySaveData
    {
        public List<string> flags = new();
    }

    [Serializable]
    public sealed class WorldSaveData
    {
        public Dictionary<string, Dictionary<string, WorldObjectState>> locations = new(StringComparer.Ordinal);
    }
}

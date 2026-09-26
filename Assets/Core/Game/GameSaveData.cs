using System;
using System.Collections.Generic;

namespace Core.Game
{
    /// <summary>Versioned, portable file format. No scene or Unity object references belong here.</summary>
    [Serializable]
    public sealed class GameSaveData
    {
        public const int CurrentVersion = 1;

        public int schemaVersion;
        public int worldBaselineVersion;
        public PlayerSaveData player;
        public StorySaveData story;
        public WorldSaveData world;

        public void Validate()
        {
            if (schemaVersion != CurrentVersion)
                throw new NotSupportedException($"Save schema version {schemaVersion} is not supported (expected {CurrentVersion}).");
            if (worldBaselineVersion < 1)
                throw new FormatException("The save is missing its world baseline version.");
            if (player?.skills == null || story?.flags == null || world?.records == null)
                throw new FormatException("The save is missing a required state section.");

            var skillIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var skill in player.skills)
            {
                if (skill == null || string.IsNullOrWhiteSpace(skill.id) || skill.level < 0 || !skillIds.Add(skill.id))
                    throw new FormatException("The save contains an invalid or duplicate skill level.");
            }

            var storyFlags = new HashSet<string>(StringComparer.Ordinal);
            foreach (var flag in story.flags)
                if (string.IsNullOrWhiteSpace(flag) || !storyFlags.Add(flag))
                    throw new FormatException("The save contains an invalid or duplicate story flag.");

            var worldKeys = new HashSet<WorldStateKey>();
            foreach (var record in world.records)
            {
                if (record == null || string.IsNullOrWhiteSpace(record.data))
                    throw new FormatException("The save contains an invalid world record.");

                var key = new WorldStateKey(record.locationId, record.objectId, record.recordType);
                if (!worldKeys.Add(key))
                    throw new FormatException("The save contains a duplicate world record.");
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
        public List<WorldStateRecord> records = new();
    }

    [Serializable]
    public sealed class WorldStateRecord
    {
        public string locationId;
        public string objectId;
        public string recordType;
        public string data;

        internal WorldStateRecord Copy() => new()
        {
            locationId = locationId,
            objectId = objectId,
            recordType = recordType,
            data = data
        };
    }
}

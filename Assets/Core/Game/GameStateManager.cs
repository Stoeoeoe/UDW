using System;
using System.Collections.Generic;
using Core.Location;

namespace Core.Game
{
    /// <summary>Owns the current game session's state across location scene loads.</summary>
    public sealed class GameStateManager : Singleton<GameStateManager>
    {
        // Increment this when authored world IDs or baselines change, then provide a migration.
        private const int WorldBaselineVersion = 1;

        public WorldState World { get; } = new WorldState();
        public PlayerState Player { get; } = new PlayerState();
        public StoryState Story { get; } = new StoryState();

        public void Save(string slot) => GameSaveService.Save(slot, Capture());

        /// <summary>Returns false for a missing slot. Validates the save envelope before replacing live state.</summary>
        public bool Load(string slot)
        {
            if (LevelManager.Instance != null && LevelManager.Instance.SceneReady)
                throw new InvalidOperationException("Load game state before entering a location; active scene objects are not rehydrated yet.");

            if (!GameSaveService.TryLoad(slot, out var data)) return false;
            if (data.worldBaselineVersion != WorldBaselineVersion)
                throw new NotSupportedException($"World baseline version {data.worldBaselineVersion} needs a migration to {WorldBaselineVersion}.");

            // Parse and validate before mutating live state. Restore skills last because it raises events.
            var levels = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (var record in data.player.skills)
                levels.Add(record.id, record.level);

            World.RestoreRecords(data.world.records);
            Story.RestoreFlags(data.story.flags);
            Player.Skills.RestoreLevels(levels);
            return true;
        }

        private GameSaveData Capture()
        {
            var data = new GameSaveData
            {
                schemaVersion = GameSaveData.CurrentVersion,
                worldBaselineVersion = WorldBaselineVersion,
                player = new PlayerSaveData(),
                story = new StorySaveData(),
                world = new WorldSaveData()
            };
            foreach (var pair in Player.Skills.GetLevels())
                data.player.skills.Add(new SkillLevelRecord { id = pair.Key, level = pair.Value });

            data.player.skills.Sort((a, b) => StringComparer.Ordinal.Compare(a.id, b.id));
            data.story.flags.AddRange(Story.GetFlags());
            data.story.flags.Sort(StringComparer.Ordinal);
            data.world.records = World.CaptureRecords();
            return data;
        }
    }
}

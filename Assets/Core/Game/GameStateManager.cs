using System;
using Core.Location;
using Core.Divinity;
using Core.TimeAndWeather;

namespace Core.Game
{
    /// <summary>Owns the current game session's state across location scene loads.</summary>
    public sealed class GameStateManager : Singleton<GameStateManager>
    {
        // Identifies the authored world baseline used by the current save format.
        private const int WorldBaselineVersion = 1;

        private GameSaveData _data = new GameSaveData();

        public WorldState World => _data.world;
        public PlayerState Player => _data.player;
        public StoryState Story => _data.story;
        public GameTimeState Time => _data.time;

        public DivineFavourManager DivineFavour { get; private set; }

        protected override void OnAwake()
        {
            base.OnAwake();
            DivineFavour = new DivineFavourManager(Player.Favour);
        }

        protected override void OnDestroy()
        {
            DivineFavour?.Dispose();
            base.OnDestroy();
        }

        public void Save(string slot)
        {
            _data.schemaVersion = GameSaveData.CurrentVersion;
            _data.worldBaselineVersion = WorldBaselineVersion;
            GameSaveService.Save(slot, _data);
        }

        /// <summary>Returns false for a missing slot. Validates the save envelope before replacing live state.</summary>
        public bool Load(string slot)
        {
            if (LevelManager.Instance != null && LevelManager.Instance.SceneReady)
                throw new InvalidOperationException("Load game state before entering a location; active scene objects are not rehydrated yet.");

            if (!GameSaveService.TryLoad(slot, out var data)) return false;
            if (data.worldBaselineVersion != WorldBaselineVersion)
                throw new NotSupportedException($"World baseline version {data.worldBaselineVersion} needs a migration to {WorldBaselineVersion}.");

            // The deserialized root is the live state; there is no second field-by-field restore path.
            DivineFavour?.Dispose();
            _data = data;
            DivineFavour = new DivineFavourManager(Player.Favour);
            if (UrTimeManager.Instance != null)
                UrTimeManager.Instance.ApplySavedTime();
            return true;
        }
    }
}

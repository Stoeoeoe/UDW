using System;
using Core.Location;
using Core.Scripting;
using Core.Spawning;
using Core.TimeAndWeather;

namespace Core.Game
{
    /// <summary>Owns the current game session's state across location scene loads.</summary>
    public sealed class GameStateManager
    {
        private readonly GameState _state;
        private readonly GameSaveService _saves;
        private readonly CutsceneRunner _cutsceneRunner;
        private readonly WorldObjectSpawner _worldObjectSpawner;
        private readonly LocationContext _location;
        private readonly GameClock _clock;

        public GameStateManager(GameState state, GameSaveService saves, CutsceneRunner cutsceneRunner,
            WorldObjectSpawner worldObjectSpawner, LocationContext location, GameClock clock)
        {
            _state = state;
            _saves = saves;
            _cutsceneRunner = cutsceneRunner;
            _worldObjectSpawner = worldObjectSpawner;
            _location = location;
            _clock = clock;
        }

        // Identifies the authored world baseline used by the current save format.
        private const int WorldBaselineVersion = 1;

        public WorldState World => _state.World;
        public PlayerState Player => _state.Player;
        public StoryState Story => _state.Story;
        public GameTimeState Time => _state.Time;

        public void Save(string slot)
        {
            if (_cutsceneRunner.IsRunning)
                throw new InvalidOperationException("Cannot save while a cutscene is staging actors. Save after its terminal cleanup.");
            _worldObjectSpawner.SavePositions();
            _state.Data.schemaVersion = GameSaveData.CurrentVersion;
            _state.Data.worldBaselineVersion = WorldBaselineVersion;
            _saves.Save(slot, _state.Data);
        }

        /// <summary>Returns false for a missing slot. Validates the save envelope before replacing live state.</summary>
        public bool Load(string slot)
        {
            if (_location.SceneReady)
                throw new InvalidOperationException("Load game state before entering a location; active scene objects are not rehydrated yet.");

            if (!_saves.TryLoad(slot, out var data)) return false;
            if (data.worldBaselineVersion != WorldBaselineVersion)
                throw new NotSupportedException($"World baseline version {data.worldBaselineVersion} needs a migration to {WorldBaselineVersion}.");

            // The deserialized root is the live state; there is no second field-by-field restore path.
            _state.Restore(data);
            _clock.ApplySavedTime();
            return true;
        }
    }
}

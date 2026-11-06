using System;
using System.IO;
using Core.Context;
using Core.Location;
using Core.Scripting;
using Core.Spawning;
using Core.TimeAndWeather;
using UnityEngine;

namespace Core.Game
{
    /// <summary>Owns the current game session's state across location scene loads.</summary>
    public sealed class GameStateManager : IDisposable
    {
        private bool _saveWhenLocationReady;
        private readonly GameState _state;
        private readonly GameSaveService _saves;
        private readonly CutsceneRunner _cutsceneRunner;
        private readonly WorldObjectSpawner _worldObjectSpawner;
        private readonly LocationContext _location;
        private readonly GameClock _clock;
        private readonly CharacterManager _characters;
        private readonly PlayerInteractionContext _interaction;
        private readonly LevelManager _level;
        // Reserved for the development quick save; it never becomes the session's current slot.
        private readonly string _quickSaveSlot = "quicksave";

        public GameStateManager(GameState state, GameSaveService saves, CutsceneRunner cutsceneRunner,
            WorldObjectSpawner worldObjectSpawner, LocationContext location, GameClock clock, CharacterManager characters,
            PlayerInteractionContext interaction, LevelManager level)
        {
            _interaction = interaction;
            _level = level;
            _level.LocationReady += OnLocationReady;
            _characters = characters;
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

        /// <summary>The slot this session was loaded from or last saved to; null until the first load or save.</summary>
        public string CurrentSlot { get; private set; }

        /// <summary>
        /// Starts a fresh game in the next free slot: the starting date and loadout, and the first location at the home bed.
        /// Like <see cref="Load"/>, only before the first location is entered. The slot is written when that location is ready.
        /// </summary>
        public void NewGame(string saveName)
        {
            if (_location.SceneReady)
                throw new InvalidOperationException("Start a new game before entering a location; active scene objects are not rehydrated yet.");
            Restore(new GameSaveData { saveName = saveName });
            _state.StartAtHome = true;
            CurrentSlot = _saves.NextSlotId();
            _saveWhenLocationReady = true;
        }

        // Without a current slot (a development start) there is nowhere to save. A disk problem must never break the
        // sleep sequence or the first location's entry, so it is logged.
        public void AutoSave()
        {
            if (CurrentSlot == null) return;
            try { Save(); }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
                Debug.LogError($"Autosave to slot '{CurrentSlot}' failed: {error.Message}");
            }
        }

        private void OnLocationReady(LocationData _)
        {
            if (!_saveWhenLocationReady) return;
            _saveWhenLocationReady = false;
            AutoSave();
        }

        public void Dispose() => _level.LocationReady -= OnLocationReady;

        /// <summary>Saves to <see cref="CurrentSlot"/>.</summary>
        public void Save() => Save(CurrentSlot ?? throw new InvalidOperationException("The session has no current slot; save to a named slot first."));

        public void Save(string slot)
        {
            WriteSave(slot);
            CurrentSlot = slot;
        }

        private void WriteSave(string slot)
        {
            if (_cutsceneRunner.IsRunning)
                throw new InvalidOperationException("Cannot save while a cutscene is staging actors. Save after its terminal cleanup.");
            _worldObjectSpawner.SavePositions();
            CaptureResumePoint();
            _state.Data.schemaVersion = GameSaveData.CurrentVersion;
            _state.Data.worldBaselineVersion = WorldBaselineVersion;
            _saves.Save(slot, _state.Data);
        }

        /// <summary>Whether the player is free to quick save or quick load: no cutscene, overnight sequence, dialogue, open screen or transition.</summary>
        public bool CanSaveOrLoadNow =>
            _location.SceneReady && !_cutsceneRunner.IsRunning && !_clock.IsOvernight &&
            _interaction.CurrentSnapshot.CanInteractWithWorld && string.IsNullOrEmpty(_interaction.CurrentSnapshot.CurrentConversation);

        /// <summary>Saves to the reserved quick-save slot, leaving <see cref="CurrentSlot"/> alone; false when not allowed right now.</summary>
        public bool QuickSave()
        {
            if (!CanSaveOrLoadNow) return false;
            WriteSave(_quickSaveSlot);
            return true;
        }

        /// <summary>
        /// Replaces the running game with the quick save behind a fade, leaving <see cref="CurrentSlot"/> alone.
        /// False when not allowed right now or nothing was quick saved. An unreadable save throws before anything changes.
        /// </summary>
        public bool QuickLoad()
        {
            if (!CanSaveOrLoadNow || !_saves.TryLoad(_quickSaveSlot, out var data)) return false;
            RequireCurrentBaseline(data);
            return _level.ReloadGame(data.session.LocationId, () => Restore(data));
        }

        private static void RequireCurrentBaseline(GameSaveData data)
        {
            if (data.worldBaselineVersion != WorldBaselineVersion)
                throw new NotSupportedException($"World baseline version {data.worldBaselineVersion} needs a migration to {WorldBaselineVersion}.");
        }

        private void Restore(GameSaveData data)
        {
            // The deserialized root is the live state; there is no second field-by-field restore path.
            _state.Restore(data);
            _clock.ApplySavedTime();
        }

        // Outside a ready location (scene-less tests, before the first entry) the previous resume point is kept.
        private void CaptureResumePoint()
        {
            if (!_location.SceneReady) return;
            var player = _characters.MainCharacter;
            var session = _state.Session;
            session.LocationId = _location.Location.id;
            session.Position = player.transform.position;
            session.Facing = player.Orientation.FacingDirection;
        }

        /// <summary>Returns false for a missing slot. Validates the save envelope before replacing live state.</summary>
        public bool Load(string slot)
        {
            if (_location.SceneReady)
                throw new InvalidOperationException("Load game state before entering a location; active scene objects are not rehydrated yet.");

            if (!_saves.TryLoad(slot, out var data)) return false;
            RequireCurrentBaseline(data);
            Restore(data);
            CurrentSlot = slot;
            return true;
        }

        /// <summary>Loads the most recently saved readable slot; false when there is none.</summary>
        public bool Continue()
        {
            var slot = _saves.GetLastPlayedSlot();
            return slot != null && Load(slot);
        }
    }
}

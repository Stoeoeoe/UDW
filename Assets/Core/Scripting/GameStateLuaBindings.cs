using System;
using Character;
using Core.Game;
using UnityEngine.Scripting;
using VContainer;
using Preserve = UnityEngine.Scripting.PreserveAttribute;

namespace Core.Scripting
{
    // Resolve global state on each call: loading a save replaces the live state objects.
    [LuaModule("GameState.Story")]
    public sealed class StoryLuaApi
    {
        [Inject] private GameState _gameState;

        [LuaCall]
        public bool Has(string key) => _gameState.Story.Has(key);

        [LuaCall]
        public StoryValue Get(string key) => _gameState.Story.GetValue(key);

        [LuaCall(writesState: true)]
        [LuaAction("story.set", "Set Story Value", "Data", "Set a saved global story value.", "cutscene", "npcRoutine",
            Validator = nameof(ValidateSet), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        public void Set(string key, StoryValue value) => _gameState.Story.SetValue(key, value);

        [LuaCall(writesState: true)]
        [LuaAction("story.remove", "Remove Story Value", "Data", "Remove a saved global story value.", "cutscene", "npcRoutine",
            Validator = nameof(ValidateKey), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        public bool Remove(string key) => _gameState.Story.Remove(key);

        [Preserve]
        public static void ValidateKey(string key) => StoryValue.RequireKey(key);

        [Preserve]
        public static void ValidateSet(string key, StoryValue value)
        {
            StoryValue.RequireKey(key);
            if (value == null) throw new ArgumentNullException(nameof(value));
            value.Validate();
        }
    }

    [LuaModule("GameState.Player.Skills")]
    internal sealed class SkillsLuaApi
    {
        [Inject] private SkillDefinitions _definitions;
        [Inject] private GameState _gameState;

        [LuaCall]
        public int GetLevel(string skillId) => _gameState.Player.Skills.GetLevel(skillId);

        [LuaCall]
        public bool HasUnlocked(string skillId) => _gameState.Player.Skills.HasUnlocked(skillId);

        [LuaCall(writesState: true)]
        public bool TryLevelUp(string skillId) => _gameState.Player.Skills.TryLevelUp(skillId, _definitions);
    }

    [LuaTable]
    internal sealed class FarmlandLuaView
    {
        [LuaField] public bool plowed;
        [LuaField] public bool irrigated;
    }

    [LuaModule("GameState.World")]
    internal sealed class WorldLuaApi
    {
        [Inject] private GameState _gameState;

        // A returned table is a snapshot. Changing it in Lua does not mutate WorldState.
        [LuaCall]
        public FarmlandLuaView GetFarmland(string locationId, string objectId)
        {
            if (!_gameState.World.TryGet<FarmlandState>(locationId, objectId, out var farmland))
                return null;

            return new FarmlandLuaView { plowed = farmland.plowed, irrigated = farmland.irrigated };
        }

        [LuaCall(writesState: true)]
        public void SetFarmland(string locationId, string objectId, bool plowed, bool irrigated)
        {
            if (!plowed && !irrigated)
                _gameState.World.Remove(locationId, objectId);
            else
                _gameState.World.Set(locationId, objectId, new FarmlandState { plowed = plowed, irrigated = irrigated });
        }
    }
}

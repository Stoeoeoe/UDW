using Core.Game;
using UnityEngine.Scripting;

namespace Core.Scripting
{
    // Resolve global state on each call: loading a save replaces the live state objects.
    [LuaModule("GameState.Story")]
    public sealed class StoryLuaApi
    {
        [LuaCall]
        public bool Has(string key) => GameState.Story.Has(key);

        [LuaCall]
        public StoryValue Get(string key) => GameState.Story.GetValue(key);

        [LuaCall(writesState: true)]
        [LuaAction("story.set", "Set Story Value", "Data", "Set a saved global story value.", "cutscene", "npcRoutine",
            Validator = nameof(ValidateSet), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        public void Set(string key, StoryValue value) => GameState.Story.SetValue(key, value);

        [LuaCall(writesState: true)]
        [LuaAction("story.remove", "Remove Story Value", "Data", "Remove a saved global story value.", "cutscene", "npcRoutine",
            Validator = nameof(ValidateKey), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        public bool Remove(string key) => GameState.Story.Remove(key);

        [Preserve]
        public static void ValidateKey(string key) => StoryValue.RequireKey(key);

        [Preserve]
        public static void ValidateSet(string key, StoryValue value)
        {
            StoryValue.RequireKey(key);
            if (value == null) throw new System.ArgumentNullException(nameof(value));
            value.Validate();
        }
    }

    [LuaModule("GameState.Player.Skills")]
    internal sealed class SkillsLuaApi
    {
        [LuaCall]
        public int GetLevel(string skillId) => GameState.Player.Skills.GetLevel(skillId);

        [LuaCall]
        public bool HasUnlocked(string skillId) => GameState.Player.Skills.HasUnlocked(skillId);

        [LuaCall(writesState: true)]
        public bool TryLevelUp(string skillId) => GameState.Player.Skills.TryLevelUp(skillId);
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
        // A returned table is a snapshot. Changing it in Lua does not mutate WorldState.
        [LuaCall]
        public FarmlandLuaView GetFarmland(string locationId, string objectId)
        {
            if (!GameState.World.TryGet<FarmlandState>(locationId, objectId, out var farmland))
                return null;

            return new FarmlandLuaView { plowed = farmland.plowed, irrigated = farmland.irrigated };
        }

        [LuaCall(writesState: true)]
        public void SetFarmland(string locationId, string objectId, bool plowed, bool irrigated)
        {
            if (!plowed && !irrigated)
                GameState.World.Remove(locationId, objectId);
            else
                GameState.World.Set(locationId, objectId, new FarmlandState { plowed = plowed, irrigated = irrigated });
        }
    }
}

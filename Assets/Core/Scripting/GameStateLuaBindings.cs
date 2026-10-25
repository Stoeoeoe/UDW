using Core.Game;

namespace Core.Scripting
{
    // Resolve global state on each call: loading a save replaces the live state objects.
    [LuaModule("GameState.Story")]
    internal sealed class StoryLuaApi
    {
        [LuaCall]
        public bool HasFlag(string flag) => GameState.Story.HasFlag(flag);

        [LuaCall(writesState: true)]
        public bool SetFlag(string flag) => GameState.Story.SetFlag(flag);

        [LuaCall(writesState: true)]
        public bool ClearFlag(string flag) => GameState.Story.ClearFlag(flag);
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

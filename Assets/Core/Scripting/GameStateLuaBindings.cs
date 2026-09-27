using System;
using Core.Game;

namespace Core.Scripting
{
    // These are scripting APIs, not persisted state types. Their getters resolve the current
    // state on every call, including after a save is loaded into a new game session.
    [LuaModule("GameState.Story")]
    internal sealed class StoryLuaApi
    {
        private readonly Func<StoryState> _state;

        public StoryLuaApi(Func<StoryState> state) => _state = state;

        [LuaCall]
        public bool HasFlag(string flag) => _state().HasFlag(flag);

        [LuaCall(writesState: true)]
        public bool SetFlag(string flag) => _state().SetFlag(flag);

        [LuaCall(writesState: true)]
        public bool ClearFlag(string flag) => _state().ClearFlag(flag);
    }

    [LuaModule("GameState.Player.Skills")]
    internal sealed class SkillsLuaApi
    {
        private readonly Func<PlayerState> _state;

        public SkillsLuaApi(Func<PlayerState> state) => _state = state;

        [LuaCall]
        public int GetLevel(string skillId) => _state().Skills.GetLevel(skillId);

        [LuaCall]
        public bool HasUnlocked(string skillId) => _state().Skills.HasUnlocked(skillId);

        [LuaCall(writesState: true)]
        public bool TryLevelUp(string skillId) => _state().Skills.TryLevelUp(skillId);
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
        private readonly Func<WorldState> _state;

        public WorldLuaApi(Func<WorldState> state) => _state = state;

        // A returned table is a snapshot. Changing it in Lua does not mutate WorldState.
        [LuaCall]
        public FarmlandLuaView GetFarmland(string locationId, string objectId)
        {
            if (!_state().TryGet<FarmlandState>(locationId, objectId, out var farmland))
                return null;

            return new FarmlandLuaView { plowed = farmland.plowed, irrigated = farmland.irrigated };
        }

        [LuaCall(writesState: true)]
        public void SetFarmland(string locationId, string objectId, bool plowed, bool irrigated)
        {
            if (!plowed && !irrigated)
                _state().Remove(locationId, objectId);
            else
                _state().Set(locationId, objectId, new FarmlandState { plowed = plowed, irrigated = irrigated });
        }
    }
}

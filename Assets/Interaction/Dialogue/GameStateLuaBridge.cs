using Core.Game;
using PixelCrushers.DialogueSystem;

namespace Interaction.Dialogue
{
    /// <summary>Dialogue System Lua functions backed by the current game session.</summary>
    public static class GameStateLuaBridge
    {
        public static void Register()
        {
            RegisterFunction("GameState_GetSkillLevel", nameof(GetSkillLevel));
            RegisterFunction("GameState_HasSkill", nameof(HasSkill));
            RegisterFunction("GameState_LevelUpSkill", nameof(LevelUpSkill));
            RegisterFunction("GameState_HasStoryFlag", nameof(HasStoryFlag));
            RegisterFunction("GameState_SetStoryFlag", nameof(SetStoryFlag));
            RegisterFunction("GameState_ClearStoryFlag", nameof(ClearStoryFlag));
        }

        public static void Unregister()
        {
            Lua.UnregisterFunction("GameState_GetSkillLevel");
            Lua.UnregisterFunction("GameState_HasSkill");
            Lua.UnregisterFunction("GameState_LevelUpSkill");
            Lua.UnregisterFunction("GameState_HasStoryFlag");
            Lua.UnregisterFunction("GameState_SetStoryFlag");
            Lua.UnregisterFunction("GameState_ClearStoryFlag");
        }

        private static void RegisterFunction(string luaName, string methodName)
            => Lua.RegisterFunction(luaName, null, typeof(GameStateLuaBridge).GetMethod(methodName));

        public static int GetSkillLevel(string skillId) => GameState.Player.Skills.GetLevel(skillId);
        public static bool HasSkill(string skillId) => GameState.Player.Skills.HasUnlocked(skillId);
        public static bool LevelUpSkill(string skillId) => GameState.Player.Skills.TryLevelUp(skillId);
        public static bool HasStoryFlag(string flag) => GameState.Story.HasFlag(flag);
        public static bool SetStoryFlag(string flag) => GameState.Story.SetFlag(flag);
        public static bool ClearStoryFlag(string flag) => GameState.Story.ClearFlag(flag);
    }
}

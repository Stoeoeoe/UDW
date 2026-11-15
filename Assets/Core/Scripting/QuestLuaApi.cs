using Core.Quests;
using VContainer;

namespace Core.Scripting
{
    /// <summary>Reads and advances quests. Every call names the quest, which must exist.</summary>
    [LuaModule("Quests")]
    public sealed class QuestLuaApi
    {
        [Inject] private QuestService _quests;

        [LuaCall, Preserve]
        public bool IsActive(string questId) => _quests.Find(questId)?.Status == QuestStatus.Active;

        [LuaCall, Preserve]
        public bool IsCompleted(string questId) => _quests.Find(questId)?.Status == QuestStatus.Completed;

        [LuaCall, Preserve]
        public bool IsFailed(string questId) => _quests.Find(questId)?.Status == QuestStatus.Failed;

        /// <summary>The step being worked on; nil unless the quest is active.</summary>
        [LuaCall, Preserve]
        public string CurrentStep(string questId) => _quests.Find(questId)?.StepId;

        [LuaCall, Preserve]
        public bool IsOnStep(string questId, string stepId) => _quests.Find(questId)?.StepId == stepId;

        [LuaCall(writesState: true), Preserve]
        public void Start(string questId) => _quests.Start(questId);

        [LuaCall(writesState: true), Preserve]
        public void CompleteObjective(string questId, string objectiveId) => _quests.CompleteObjective(questId, objectiveId);

        [LuaCall(writesState: true), Preserve]
        public void CompleteStep(string questId) => _quests.CompleteStep(questId);
    }
}

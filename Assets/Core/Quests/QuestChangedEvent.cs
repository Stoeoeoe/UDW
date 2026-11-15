using Core.Events;

namespace Core.Quests
{
    public enum QuestChange
    {
        Started,
        StepFinished,
        Completed,
        Failed
    }

    /// <summary>Raised when a quest starts, finishes a step, completes or fails, for notices.</summary>
    public struct QuestChangedEvent
    {
        public QuestDefinition Quest;
        public QuestChange Change;

        public static void Trigger(QuestDefinition quest, QuestChange change) =>
            EventBus<QuestChangedEvent>.Raise(new QuestChangedEvent { Quest = quest, Change = change });
    }
}

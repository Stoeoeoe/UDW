using System;
using System.Collections.Generic;
using Sirenix.Serialization;

namespace Core.Quests
{
    public enum QuestStatus
    {
        Active,
        Completed,
        Failed
    }

    /// <summary>A step the player finished, and when (<see cref="Core.Game.GameTimeState.TotalMinutes"/>).</summary>
    [Serializable]
    public struct FinishedQuestStep
    {
        public string StepId;
        public long AtMinute;
    }

    /// <summary>One started quest's saved progress.</summary>
    [Serializable]
    public sealed class QuestProgress
    {
        public QuestStatus Status;
        /// <summary>The step being worked on; null once the quest has ended.</summary>
        public string StepId;
        public long StartedAtMinute;
        /// <summary>Finished steps in order, for the journal's history.</summary>
        public List<FinishedQuestStep> FinishedSteps = new();
        /// <summary>The current step's objectives already done.</summary>
        public HashSet<string> CompletedObjectives = new(StringComparer.Ordinal);
    }

    /// <summary>The saved progress of every quest the player has started.</summary>
    [Serializable]
    public sealed class QuestState
    {
        [OdinSerialize] private Dictionary<string, QuestProgress> _quests = new(StringComparer.Ordinal);

        /// <summary>The quest's progress; null if it has not been started.</summary>
        public QuestProgress Find(string questId) => _quests.TryGetValue(questId, out var progress) ? progress : null;

        internal void Add(string questId, QuestProgress progress) => _quests.Add(questId, progress);

        internal IEnumerable<KeyValuePair<string, QuestProgress>> All => _quests;

        internal void Validate()
        {
            if (_quests == null) throw new FormatException("The save is missing quest state.");
            foreach (var pair in _quests)
            {
                var progress = pair.Value;
                if (string.IsNullOrWhiteSpace(pair.Key) || progress?.FinishedSteps == null || progress.CompletedObjectives == null ||
                    !Enum.IsDefined(typeof(QuestStatus), progress.Status) ||
                    (progress.Status == QuestStatus.Active) == string.IsNullOrWhiteSpace(progress.StepId))
                    throw new FormatException($"The save contains invalid progress for quest '{pair.Key}'.");
            }
        }
    }
}

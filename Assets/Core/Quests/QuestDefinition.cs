using System;
using System.Collections.Generic;
using Core.Common;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Core.Quests
{
    public enum QuestObjectiveKind
    {
        /// <summary>Talk to a character, optionally playing a quest dialogue.</summary>
        Talk,
        /// <summary>Talk to a character while carrying the items, which are taken.</summary>
        Deliver,
        /// <summary>Carry the items.</summary>
        Have,
        /// <summary>Enter a map, or a trigger area on it.</summary>
        Reach,
        /// <summary>A read-only Lua condition holds.</summary>
        Condition
    }

    /// <summary>Something a step needs; which fields apply depends on <see cref="Kind"/>.</summary>
    [Serializable]
    public sealed class QuestObjective
    {
        [SerializeField, ReadOnly] private string id;
        [SerializeField, ReadOnly] private QuestObjectiveKind kind;
        [SerializeField, ReadOnly] private string text;
        [SerializeField, ReadOnly] private string characterId;
        [SerializeField, ReadOnly] private string dialogueId;
        [SerializeField, ReadOnly] private string itemId;
        [SerializeField, ReadOnly] private int count;
        [SerializeField, ReadOnly] private string mapId;
        [SerializeField, ReadOnly] private string triggerId;
        [SerializeField, ReadOnly] private string condition;

        public string Id => id;
        public QuestObjectiveKind Kind => kind;
        /// <summary>The journal line in the source language; <see cref="QuestDefinition.Text"/> gives what the player reads.</summary>
        public string SourceText => text;
        /// <summary>Talk and deliver: who to talk to.</summary>
        public string CharacterId => characterId;
        /// <summary>Talk and deliver: the dialogue that plays instead of the character's usual one; empty for theirs.</summary>
        public string DialogueId => dialogueId;
        /// <summary>Deliver and have: the item.</summary>
        public string ItemId => itemId;
        /// <summary>Deliver and have: how many.</summary>
        public int Count => count;
        /// <summary>Reach: the map.</summary>
        public string MapId => mapId;
        /// <summary>Reach: a trigger area on the map; empty for anywhere on it.</summary>
        public string TriggerId => triggerId;
        /// <summary>Condition: the read-only Lua expression.</summary>
        public string Condition => condition;

        private QuestObjective(string id, QuestObjectiveKind kind, string text)
        {
            this.id = id;
            this.kind = kind;
            this.text = text;
            characterId = dialogueId = itemId = mapId = triggerId = condition = "";
        }

        public static QuestObjective Talk(string id, string text, string character, string dialogue = null) =>
            new(id, QuestObjectiveKind.Talk, text) { characterId = character, dialogueId = dialogue ?? "" };

        public static QuestObjective Deliver(string id, string text, string character, string item, int count, string dialogue = null) =>
            new(id, QuestObjectiveKind.Deliver, text) { characterId = character, itemId = item, count = count, dialogueId = dialogue ?? "" };

        public static QuestObjective Have(string id, string text, string item, int count) =>
            new(id, QuestObjectiveKind.Have, text) { itemId = item, count = count };

        public static QuestObjective Reach(string id, string text, string map, string trigger = null) =>
            new(id, QuestObjectiveKind.Reach, text) { mapId = map, triggerId = trigger ?? "" };

        public static QuestObjective WhenTrue(string id, string text, string luaCondition) =>
            new(id, QuestObjectiveKind.Condition, text) { condition = luaCondition };
    }

    /// <summary>A step of a quest: journal text, the objectives that complete it, and optionally a deadline.</summary>
    [Serializable]
    public sealed class QuestStep
    {
        [SerializeField, ReadOnly] private string id;
        [SerializeField, ReadOnly] private string journal;
        [SerializeField, ReadOnly, Validation.Unique(nameof(QuestObjective.Id))]
        private QuestObjective[] objectives;
        [SerializeField, ReadOnly] private bool hasDeadline;
        [SerializeField, ReadOnly] private int deadlineDays;
        [SerializeField, ReadOnly, Tooltip("Minutes after midnight on the deadline's day; -1 for the end of the day.")]
        private int deadlineMinute;
        [SerializeField, ReadOnly] private string failWhen;
        [SerializeField, ReadOnly] private string onComplete;

        public string Id => id;
        /// <summary>Journal text in the source language; <see cref="QuestDefinition.Journal"/> gives what the player reads.</summary>
        public string SourceJournal => journal;
        public QuestObjective[] Objectives => objectives;
        public bool HasDeadline => hasDeadline;
        /// <summary>Days after the step begins; 0 is the same day.</summary>
        public int DeadlineDays => deadlineDays;
        /// <summary>Minutes after midnight on the deadline's day; -1 for the end of the day.</summary>
        public int DeadlineMinute => deadlineMinute;
        /// <summary>Read-only Lua expression; the quest fails while it holds during the step. Empty for none.</summary>
        public string FailWhen => failWhen;
        /// <summary>Lua actions run when the step completes; empty for none.</summary>
        public string OnComplete => onComplete;

        public QuestStep(string id, string journal, QuestObjective[] objectives, string failWhen = null, string onComplete = null)
        {
            this.id = id;
            this.journal = journal;
            this.objectives = objectives ?? Array.Empty<QuestObjective>();
            this.failWhen = failWhen ?? "";
            this.onComplete = onComplete ?? "";
            deadlineMinute = -1;
        }

        /// <param name="minuteOfDay">Minutes after midnight; null for the end of the day.</param>
        public QuestStep WithDeadline(int days, int? minuteOfDay)
        {
            hasDeadline = true;
            deadlineDays = days;
            deadlineMinute = minuteOfDay ?? -1;
            return this;
        }
    }

    /// <summary>
    /// A story quest authored in Vulcanus (*.quest.json): steps run in order until the quest is completed or fails.
    /// Texts are translated through message keys derived from the quest, step and objective IDs, which stay stable
    /// because saves refer to them too: <c>quest.&lt;quest&gt;.title</c>, <c>.description</c>,
    /// <c>.&lt;step&gt;.journal</c> and <c>.&lt;step&gt;.&lt;objective&gt;.text</c>.
    /// </summary>
    public sealed class QuestDefinition : ValidatedScriptableObject<QuestValidator>
    {
        /// <summary>A text from the quest's i18n file.</summary>
        [Serializable]
        public struct Message
        {
            public string msgKey;
            public string text;
        }

        [SerializeField, ReadOnly] private string questId;
        [SerializeField, ReadOnly] private string title;
        [SerializeField, ReadOnly] private string description;
        [SerializeField, ReadOnly, Tooltip("Character who gives the quest; empty for none.")] private string giverId;
        [SerializeField, ReadOnly] private string onStart;
        [SerializeField, ReadOnly] private string onComplete;
        [SerializeField, ReadOnly] private string onFail;
        // The schema checks everything else at import; only unique IDs are beyond it.
        [SerializeField, ReadOnly, Validation.Nested, Validation.Unique(nameof(QuestStep.Id))]
        private QuestStep[] steps = Array.Empty<QuestStep>();
        [SerializeField, ReadOnly] private Message[] messages = Array.Empty<Message>();

        [NonSerialized] private Dictionary<string, string> _textByKey;

        public string QuestId => questId;
        /// <summary>The title in the source language.</summary>
        public string SourceTitle => title;
        /// <summary>The description in the source language.</summary>
        public string SourceDescription => description;
        /// <summary>Character who gives the quest; empty for none.</summary>
        public string GiverId => giverId;
        /// <summary>Lua actions run when the quest starts; empty for none.</summary>
        public string OnStart => onStart;
        /// <summary>Lua actions run when the last step completes; empty for none.</summary>
        public string OnComplete => onComplete;
        /// <summary>Lua actions run when the quest fails; empty for none.</summary>
        public string OnFail => onFail;
        public QuestStep[] Steps => steps;

        /// <summary>The title as the player reads it.</summary>
        public string Title => Translate($"quest.{questId}.title", title);

        /// <summary>The description as the player reads it.</summary>
        public string Description => Translate($"quest.{questId}.description", description);

        /// <summary>A step's journal text as the player reads it.</summary>
        public string Journal(QuestStep step) => Translate($"quest.{questId}.{step.Id}.journal", step.SourceJournal);

        /// <summary>An objective's journal line as the player reads it.</summary>
        public string Text(QuestStep step, QuestObjective objective) =>
            Translate($"quest.{questId}.{step.Id}.{objective.Id}.text", objective.SourceText);

        /// <summary>The text from the quest's i18n file, otherwise the source text.</summary>
        private string Translate(string msgKey, string sourceText)
        {
            if (_textByKey == null)
            {
                _textByKey = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (var message in messages)
                    if (!string.IsNullOrEmpty(message.text)) _textByKey[message.msgKey] = message.text;
            }
            return _textByKey.TryGetValue(msgKey, out var translated) ? translated : sourceText;
        }

#if UNITY_EDITOR
        public void Configure(string id, string questTitle, string questDescription, string giver, QuestStep[] questSteps,
            string startActions = null, string completeActions = null, string failActions = null, Message[] texts = null)
        {
            questId = id;
            title = questTitle;
            description = questDescription;
            giverId = giver ?? "";
            steps = questSteps ?? Array.Empty<QuestStep>();
            onStart = startActions ?? "";
            onComplete = completeActions ?? "";
            onFail = failActions ?? "";
            messages = texts ?? Array.Empty<Message>();
            _textByKey = null;
            RequireValidConfiguration();
        }
#endif
    }
}

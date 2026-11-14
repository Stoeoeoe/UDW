using System;
using System.Collections.Generic;
using Core.Common;
using Newtonsoft.Json;
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
        [SerializeField, ReadOnly] private string character;
        [SerializeField, ReadOnly] private string dialogue;
        [SerializeField, ReadOnly] private string item;
        [SerializeField, ReadOnly] private int count;
        [SerializeField, ReadOnly] private string map;
        [SerializeField, ReadOnly] private string trigger;
        [SerializeField, ReadOnly, Validation.LuaExpression] private string condition;

        public string Id => id;
        public QuestObjectiveKind Kind => kind;
        /// <summary>The journal line in the source language; <see cref="QuestDefinition.Text"/> gives what the player reads.</summary>
        public string SourceText => text;
        /// <summary>Talk and deliver: who to talk to.</summary>
        public string CharacterId => character;
        /// <summary>Talk and deliver: the dialogue that plays instead of the character's usual one; empty for theirs.</summary>
        public string DialogueId => dialogue;
        /// <summary>Deliver and have: the item.</summary>
        public string ItemId => item;
        /// <summary>Deliver and have: how many.</summary>
        public int Count => count;
        /// <summary>Reach: the map.</summary>
        public string MapId => map;
        /// <summary>Reach: a trigger area on the map; empty for anywhere on it.</summary>
        public string TriggerId => trigger;
        /// <summary>Condition: the read-only Lua expression.</summary>
        public string Condition => condition;
    }

    /// <summary>When a step must be done: days after it begins, at a time of day or the end of that day.</summary>
    [Serializable]
    public sealed class QuestDeadline
    {
        [SerializeField, ReadOnly, Tooltip("Days after the step begins; -1 for no deadline.")] private int days = -1;
        [SerializeField, ReadOnly, JsonConverter(typeof(ClockTimeJsonConverter)),
         Tooltip("Minutes after midnight on that day; -1 for the end of the day.")]
        private int at = -1;

        public int Days => days;
        public int Minute => at;
    }

    /// <summary>A step of a quest: journal text, the objectives that complete it, and optionally a deadline.</summary>
    [Serializable]
    public sealed class QuestStep
    {
        [SerializeField, ReadOnly] private string id;
        [SerializeField, ReadOnly] private string journal;
        [SerializeField, ReadOnly, Validation.Nested, Validation.Unique(nameof(QuestObjective.Id))]
        private QuestObjective[] objectives = Array.Empty<QuestObjective>();
        [SerializeField, ReadOnly] private QuestDeadline deadline = new();
        [SerializeField, ReadOnly, Validation.LuaExpression] private string failWhen;
        [SerializeField, ReadOnly, Validation.LuaChunk] private string onComplete;

        public string Id => id;
        /// <summary>Journal text in the source language; <see cref="QuestDefinition.Journal"/> gives what the player reads.</summary>
        public string SourceJournal => journal;
        public QuestObjective[] Objectives => objectives;
        public bool HasDeadline => deadline.Days >= 0;
        /// <summary>Days after the step begins; 0 is the same day.</summary>
        public int DeadlineDays => deadline.Days;
        /// <summary>Minutes after midnight on the deadline's day; -1 for the end of the day.</summary>
        public int DeadlineMinute => deadline.Minute;
        /// <summary>Read-only Lua expression; the quest fails while it holds during the step. Empty for none.</summary>
        public string FailWhen => failWhen;
        /// <summary>Lua actions run when the step completes; empty for none.</summary>
        public string OnComplete => onComplete;
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

        [SerializeField, ReadOnly] private string id;
        [SerializeField, ReadOnly] private string title;
        [SerializeField, ReadOnly] private string description;
        [SerializeField, ReadOnly, Tooltip("Character who gives the quest; empty for none.")] private string giver;
        [SerializeField, ReadOnly, Validation.LuaChunk] private string onStart;
        [SerializeField, ReadOnly, Validation.LuaChunk] private string onComplete;
        [SerializeField, ReadOnly, Validation.LuaChunk] private string onFail;
        // The schema checks everything else at import; only unique IDs and Lua syntax are beyond it.
        [SerializeField, ReadOnly, Validation.Nested, Validation.Unique(nameof(QuestStep.Id))]
        private QuestStep[] steps = Array.Empty<QuestStep>();
        [SerializeField, ReadOnly, Tooltip("Texts from the quest's i18n file.")] private Message[] messages = Array.Empty<Message>();

        [NonSerialized] private Dictionary<string, string> _textByKey;

        public string QuestId => id;
        /// <summary>The title in the source language.</summary>
        public string SourceTitle => title;
        /// <summary>The description in the source language.</summary>
        public string SourceDescription => description;
        /// <summary>Character who gives the quest; empty for none.</summary>
        public string GiverId => giver;
        /// <summary>Lua actions run when the quest starts; empty for none.</summary>
        public string OnStart => onStart;
        /// <summary>Lua actions run when the last step completes; empty for none.</summary>
        public string OnComplete => onComplete;
        /// <summary>Lua actions run when the quest fails; empty for none.</summary>
        public string OnFail => onFail;
        public QuestStep[] Steps => steps;

        /// <summary>The title as the player reads it.</summary>
        public string Title => Translate($"quest.{id}.title", title);

        /// <summary>The description as the player reads it.</summary>
        public string Description => Translate($"quest.{id}.description", description);

        /// <summary>A step's journal text as the player reads it.</summary>
        public string Journal(QuestStep step) => Translate($"quest.{id}.{step.Id}.journal", step.SourceJournal);

        /// <summary>An objective's journal line as the player reads it.</summary>
        public string Text(QuestStep step, QuestObjective objective) =>
            Translate($"quest.{id}.{step.Id}.{objective.Id}.text", objective.SourceText);

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
    }
}

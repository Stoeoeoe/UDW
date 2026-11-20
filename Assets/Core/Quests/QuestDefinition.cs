using System;
using System.Collections.Generic;
using Core.Common;
using Newtonsoft.Json;
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

    /// <summary>A moment at which a quest is considered for starting by itself.</summary>
    public enum QuestStartKind
    {
        /// <summary>A new game begins. Loading a save does not count.</summary>
        GameStart,
        /// <summary>A new day begins.</summary>
        NewDay,
        /// <summary>A season begins, optionally a particular one.</summary>
        NewSeason,
        /// <summary>Every ten-minute clock step. The most frequent moment.</summary>
        EveryTenMinutes,
        /// <summary>The favour with a deity changes, optionally a particular deity and a threshold.</summary>
        DivineFavour,
        /// <summary>The player enters a map, optionally a particular one.</summary>
        LocationChanged
    }

    /// <summary>One moment of a quest's start; which fields apply depends on <see cref="On"/>.</summary>
    [Serializable, ImportedData]
    public sealed class QuestStartMoment
    {
        [field: SerializeField] public QuestStartKind On { get; private set; }
        /// <summary>New season: only this season ("spring" ...); empty for any.</summary>
        [field: SerializeField] public string Season { get; private set; }
        /// <summary>Divine favour: only this deity; empty for any.</summary>
        [field: SerializeField, Validation.Reference(typeof(Core.Divinity.DeityDefinition))] public string Deity { get; private set; }
        /// <summary>Divine favour: only once the favour is at least this much; 0 for any.</summary>
        [field: SerializeField] public int AtLeast { get; private set; }
        /// <summary>Location changed: only this map; empty for any.</summary>
        [field: SerializeField] public string Map { get; private set; }
    }

    /// <summary>When a quest starts by itself: at any of the moments, if the condition holds.</summary>
    [Serializable, ImportedData]
    public sealed class QuestStart
    {
        [field: SerializeField, Validation.Nested] public QuestStartMoment[] When { get; private set; } = Array.Empty<QuestStartMoment>();
        /// <summary>Read-only Lua expression; empty to start at the moment alone.</summary>
        [field: SerializeField, Validation.LuaExpression] public string Condition { get; private set; }
    }

    /// <summary>Something a step needs; which fields apply depends on <see cref="Kind"/>.</summary>
    [Serializable, ImportedData]
    public sealed class QuestObjective
    {
        [field: SerializeField] public string Id { get; private set; }
        [field: SerializeField] public QuestObjectiveKind Kind { get; private set; }
        /// <summary>The journal line in the source language; <see cref="QuestDefinition.TranslatedText"/> gives what the player reads.</summary>
        [field: SerializeField] public string Text { get; private set; }
        /// <summary>Talk and deliver: who to talk to.</summary>
        [field: SerializeField, Validation.Reference(typeof(global::Character.CharacterDefinition))] public string Character { get; private set; }
        /// <summary>Talk and deliver: the dialogue that plays instead of the character's usual one; empty for theirs.</summary>
        [field: SerializeField, Validation.Reference(typeof(Core.Dialogue.Vulcanus.VulcanusDialogueAsset))]
        public string Dialogue { get; private set; }
        /// <summary>Deliver and have: the item.</summary>
        [field: SerializeField, Validation.Reference(typeof(Core.Inventory.ItemDefinition))] public string Item { get; private set; }
        /// <summary>Deliver and have: how many.</summary>
        [field: SerializeField] public int Count { get; private set; }
        /// <summary>Reach: the map.</summary>
        [field: SerializeField] public string Map { get; private set; }
        /// <summary>Reach: a trigger area on the map; empty for anywhere on it.</summary>
        [field: SerializeField] public string Trigger { get; private set; }
        /// <summary>Condition: the read-only Lua expression.</summary>
        [field: SerializeField, Validation.LuaExpression] public string Condition { get; private set; }
        /// <summary>
        /// A step ID, or <see cref="QuestStep.End"/>; empty for none. Meeting this objective completes the step at once and
        /// continues there, instead of waiting for the objectives without a next.
        /// </summary>
        [field: SerializeField] public string Next { get; private set; }

        public bool Branches => !string.IsNullOrEmpty(Next);
    }

    /// <summary>When a step must be done: days after it begins, at a time of day or the end of that day.</summary>
    [Serializable, ImportedData]
    public sealed class QuestDeadline
    {
        [field: SerializeField, Tooltip("Days after the step begins; -1 for no deadline.")] public int Days { get; private set; } = -1;
        [field: SerializeField, JsonConverter(typeof(ClockTimeJsonConverter)),
                Tooltip("Minutes after midnight on that day; -1 for the end of the day.")]
        public int At { get; private set; } = -1;
    }

    /// <summary>Where a step continues if a condition holds when it completes.</summary>
    [Serializable, ImportedData]
    public sealed class QuestBranch
    {
        /// <summary>Read-only Lua expression.</summary>
        [field: SerializeField, Validation.LuaExpression] public string Condition { get; private set; }
        /// <summary>A step ID, or <see cref="QuestStep.End"/>.</summary>
        [field: SerializeField] public string Next { get; private set; }
    }

    /// <summary>A step of a quest: journal text, the objectives that complete it, and optionally a deadline.</summary>
    [Serializable, ImportedData]
    public sealed class QuestStep
    {
        /// <summary>The <see cref="Next"/> that completes the quest. Not usable as a step ID.</summary>
        public const string End = "end";

        [field: SerializeField] public string Id { get; private set; }
        /// <summary>Journal text in the source language; <see cref="QuestDefinition.TranslatedJournal"/> gives what the player reads.</summary>
        [field: SerializeField] public string Journal { get; private set; }
        [field: SerializeField, Validation.Nested, Validation.Unique(nameof(QuestObjective.Id))]
        public QuestObjective[] Objectives { get; private set; } = Array.Empty<QuestObjective>();
        [field: SerializeField] public QuestDeadline Deadline { get; private set; } = new();
        /// <summary>Read-only Lua expression; the quest fails while it holds during the step. Empty for none.</summary>
        [field: SerializeField, Validation.LuaExpression] public string FailWhen { get; private set; }
        /// <summary>Lua actions run when the step completes; empty for none.</summary>
        [field: SerializeField, Validation.LuaChunk] public string OnComplete { get; private set; }
        /// <summary>
        /// Where the quest continues when the step completes without a branching objective: a step ID or
        /// <see cref="End"/>. Empty for the following step in the list, or the end after the last.
        /// </summary>
        [field: SerializeField] public string Next { get; private set; }
        /// <summary>
        /// Checked in order when the step completes without a branching objective; the first condition that holds
        /// decides where the quest continues, before <see cref="Next"/>.
        /// </summary>
        [field: SerializeField, Validation.Nested] public QuestBranch[] NextIf { get; private set; } = Array.Empty<QuestBranch>();

        public bool HasDeadline => Deadline.Days >= 0;
        /// <summary>The game minute the deadline passes, for a step that began at <paramref name="startedAtMinute"/>.</summary>
        public long DeadlineAtMinute(long startedAtMinute)
        {
            const int day = 24 * 60;
            var deadlineDay = startedAtMinute / day + Deadline.Days;
            return deadlineDay * day + (Deadline.At >= 0 ? Deadline.At : day);
        }
    }

    /// <summary>
    /// A story quest authored in Vulcanus (*.quest.json): steps run in order until the quest is completed or fails.
    /// Texts are translated through message keys derived from the quest, step and objective IDs, which stay stable
    /// because saves refer to them too: <c>quest.&lt;quest&gt;.title</c>, <c>.description</c>,
    /// <c>.&lt;step&gt;.journal</c> and <c>.&lt;step&gt;.&lt;objective&gt;.text</c>.
    /// </summary>
    [ImportedData]
    public sealed class QuestDefinition : ValidatedScriptableObject<QuestValidator>
    {
        /// <summary>A text from the quest's i18n file.</summary>
        [Serializable, ImportedData]
        public struct Message
        {
            public string msgKey;
            public string text;
        }

        [field: SerializeField] public string Id { get; private set; }
        /// <summary>The title in the source language; <see cref="TranslatedTitle"/> gives what the player reads.</summary>
        [field: SerializeField] public string Title { get; private set; }
        /// <summary>The description in the source language; <see cref="TranslatedDescription"/> gives what the player reads.</summary>
        [field: SerializeField] public string Description { get; private set; }
        /// <summary>Character who gives the quest; empty for none.</summary>
        [field: SerializeField, Validation.Reference(typeof(global::Character.CharacterDefinition))] public string Giver { get; private set; }
        /// <summary>Lua actions run when the quest starts; empty for none.</summary>
        [field: SerializeField, Validation.LuaChunk] public string OnStart { get; private set; }
        /// <summary>Lua actions run when the last step completes; empty for none.</summary>
        [field: SerializeField, Validation.LuaChunk] public string OnComplete { get; private set; }
        /// <summary>Lua actions run when the quest fails; empty for none.</summary>
        [field: SerializeField, Validation.LuaChunk] public string OnFail { get; private set; }
        /// <summary>When the quest starts by itself; without moments it starts only through an action.</summary>
        [field: SerializeField, Validation.Nested] public QuestStart Start { get; private set; } = new();
        // The schema checks everything else at import; only unique IDs and Lua syntax are beyond it.
        [field: SerializeField, Validation.Nested, Validation.Unique(nameof(QuestStep.Id))]
        public QuestStep[] Steps { get; private set; } = Array.Empty<QuestStep>();
        [field: SerializeField, Tooltip("Texts from the quest's i18n file.")]
        public Message[] Messages { get; private set; } = Array.Empty<Message>();

        [NonSerialized] private Dictionary<string, string> _textByKey;

        /// <summary>
        /// Where the quest continues after the step when no objective branches: the first <see cref="QuestStep.NextIf"/>
        /// whose condition holds, else the step's next, else the following step. A step ID, or <see cref="QuestStep.End"/>.
        /// </summary>
        public string NextStepId(QuestStep step, Func<string, bool> holds)
        {
            foreach (var branch in step.NextIf)
                if (holds(branch.Condition)) return branch.Next;
            return DefaultNextStepId(step);
        }

        /// <summary>The step's next, or the following step; every possible continuation is a path of the quest.</summary>
        public string DefaultNextStepId(QuestStep step)
        {
            if (!string.IsNullOrEmpty(step.Next)) return step.Next;
            var index = Array.IndexOf(Steps, step) + 1;
            return index == Steps.Length ? QuestStep.End : Steps[index].Id;
        }

        /// <summary>The title as the player reads it.</summary>
        public string TranslatedTitle => Translate($"quest.{Id}.title", Title);

        /// <summary>The description as the player reads it.</summary>
        public string TranslatedDescription => Translate($"quest.{Id}.description", Description);

        /// <summary>A step's journal text as the player reads it.</summary>
        public string TranslatedJournal(QuestStep step) => Translate($"quest.{Id}.{step.Id}.journal", step.Journal);

        /// <summary>An objective's journal line as the player reads it.</summary>
        public string TranslatedText(QuestStep step, QuestObjective objective) =>
            Translate($"quest.{Id}.{step.Id}.{objective.Id}.text", objective.Text);

        /// <summary>The text from the quest's i18n file, otherwise the source text.</summary>
        private string Translate(string msgKey, string sourceText)
        {
            if (_textByKey == null)
            {
                _textByKey = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (var message in Messages)
                    if (!string.IsNullOrEmpty(message.text)) _textByKey[message.msgKey] = message.text;
            }
            return _textByKey.TryGetValue(msgKey, out var translated) ? translated : sourceText;
        }
    }
}

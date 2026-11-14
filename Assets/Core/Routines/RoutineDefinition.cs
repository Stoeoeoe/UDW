using System;
using Core.Common;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Core.Routines
{
    /// <summary>A map anchor a routine starts from or walks to.</summary>
    [Serializable]
    public sealed class RoutinePlace
    {
        [SerializeField, ReadOnly] private string map;
        [SerializeField, ReadOnly] private string anchor;
        public string MapId => map;
        public string AnchorId => anchor;

        public override string ToString() => $"{map}/{anchor}";

        /// <summary>Reads a goal's destination: "home" as an empty place, otherwise a map anchor.</summary>
        public sealed class DestinationJsonConverter : JsonConverter<RoutinePlace>
        {
            public override RoutinePlace ReadJson(JsonReader reader, Type objectType, RoutinePlace existingValue, bool hasExistingValue,
                JsonSerializer serializer)
            {
                var place = new RoutinePlace();
                var token = JToken.Load(reader);
                if (token.Type == JTokenType.Object) serializer.Populate(token.CreateReader(), place);
                return place;
            }

            public override void WriteJson(JsonWriter writer, RoutinePlace value, JsonSerializer serializer) =>
                throw new NotSupportedException("Routines are only read.");
        }
    }

    /// <summary>What a character does at a goal's destination.</summary>
    [Serializable]
    public sealed class RoutineActivity
    {
        [SerializeField, ReadOnly] private string animation;
        /// <summary>Character animation played at the destination; empty for none.</summary>
        public string AnimationId => animation;
    }

    /// <summary>One stop of a day: when to set off, where to go and what to do there.</summary>
    [Serializable]
    public sealed class RoutineGoal
    {
        [SerializeField, ReadOnly] private string id;
        [SerializeField, ReadOnly, JsonConverter(typeof(ClockTimeJsonConverter)), Tooltip("Minutes after midnight.")]
        private int departAt;
        [SerializeField, ReadOnly, Validation.LuaExpression] private string condition;
        [SerializeField, ReadOnly, JsonConverter(typeof(RoutinePlace.DestinationJsonConverter)),
         Tooltip("Empty for the routine's home.")]
        private RoutinePlace destination = new();
        [SerializeField, ReadOnly] private RoutineActivity activity = new();
        [SerializeField, ReadOnly, Tooltip("Dialogue while walking here; empty keeps the one before.")] private string walkingDialogue;
        [SerializeField, ReadOnly, Tooltip("Dialogue once arrived; empty keeps the one before.")] private string dialogue;

        public string Id => id;
        public int DepartMinute => departAt;
        /// <summary>Read-only Lua expression; empty means always.</summary>
        public string Condition => condition;
        public bool ToHome => string.IsNullOrEmpty(destination.MapId);
        /// <summary>Null when <see cref="ToHome"/>.</summary>
        public RoutinePlace Destination => ToHome ? null : destination;
        /// <summary>Character animation played at the destination; empty for none.</summary>
        public string ActivityAnimationId => activity.AnimationId;
        /// <summary>Dialogue ID while walking to this goal; empty keeps the dialogue in effect before.</summary>
        public string WalkingDialogueId => walkingDialogue;
        /// <summary>Dialogue ID once arrived; empty keeps the dialogue in effect before.</summary>
        public string DialogueId => dialogue;
    }

    /// <summary>Goals for one kind of day: an override, a variant or a member of a <c>pickOne</c> pool.</summary>
    [Serializable]
    public abstract class RoutineDay
    {
        [SerializeField, ReadOnly] private string id;
        [SerializeField, ReadOnly, Validation.LuaExpression] private string condition;
        [SerializeField, ReadOnly, Validation.Nested] private RoutineGoal[] goals = Array.Empty<RoutineGoal>();

        public string Id => id;
        /// <summary>Read-only Lua expression; empty means always.</summary>
        public string Condition => condition;
        public RoutineGoal[] Goals => goals;
    }

    /// <summary>A member of a <c>pickOne</c> pool.</summary>
    [Serializable]
    public sealed class RoutineChoice : RoutineDay
    {
        [SerializeField, ReadOnly] private float weight = 1f;
        /// <summary>Relative chance of being chosen among the pool's matching members.</summary>
        public float Weight => weight;
    }

    /// <summary>An override or variant: its own goals, or a pool of choices when <see cref="IsPool"/>.</summary>
    [Serializable]
    public sealed class RoutineEntry : RoutineDay
    {
        [SerializeField, ReadOnly, Validation.Nested] private RoutineChoice[] pickOne = Array.Empty<RoutineChoice>();
        public RoutineChoice[] PickOne => pickOne;
        public bool IsPool => pickOne is { Length: > 0 };
    }

    /// <summary>An NPC's daily routine authored in Vulcanus (*.routine.json). Plan a day with <see cref="RoutinePlanner"/>.</summary>
    public sealed class RoutineDefinition : ValidatedScriptableObject<RoutineValidator>
    {
        [SerializeField, ReadOnly, Validation.NamespacedId("The source requires a lowercase namespace:name ID.", Lowercase = true)]
        private string id;
        [SerializeField, ReadOnly, Validation.NamespacedId("The source requires the character's namespace:name ID.", Lowercase = true)]
        private string character;
        [SerializeField, ReadOnly, Validation.Required("The source requires a home.")] private RoutinePlace home;
        [SerializeField, ReadOnly, Tooltip("Dialogue at the start of each day, until a goal sets another; empty for none.")]
        private string dialogue;
        [SerializeField, ReadOnly, Validation.Nested] private RoutineEntry[] overrides = Array.Empty<RoutineEntry>();
        [SerializeField, ReadOnly, Validation.Nested] private RoutineEntry[] variants = Array.Empty<RoutineEntry>();

        public string RoutineId => id;
        public string CharacterId => character;
        public RoutinePlace Home => home;
        /// <summary>Dialogue ID at the start of each day; empty when the character cannot be talked to until a goal sets one.</summary>
        public string DialogueId => dialogue;
        public RoutineEntry[] Overrides => overrides;
        public RoutineEntry[] Variants => variants;
    }
}

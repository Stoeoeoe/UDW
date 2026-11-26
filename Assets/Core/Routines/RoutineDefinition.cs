using System;
using Core.Common;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Core.Routines
{
    /// <summary>A map anchor, or an entity placed on the map that has interaction slots, which a routine starts from or walks to.</summary>
    [Serializable, ImportedData]
    public sealed class RoutinePlace
    {
        [field: SerializeField] public string Map { get; private set; }
        [field: SerializeField] public string Anchor { get; private set; }
        /// <summary>Instance ID of a placed entity whose slots the character uses; empty for an anchor.</summary>
        [field: SerializeField] public string Entity { get; private set; }

        public bool IsEntity => !string.IsNullOrEmpty(Entity);

        public override string ToString() => $"{Map}/{(IsEntity ? Entity : Anchor)}";

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
    [Serializable, ImportedData]
    public sealed class RoutineActivity
    {
        /// <summary>Character animation played at the destination; empty for none.</summary>
        [field: SerializeField, Validation.Reference(typeof(Character.Animations.CharacterAnimationDefinition))]
        public string Animation { get; private set; }
    }

    /// <summary>
    /// What a routine says about the dialogue at one point of the day: nothing (the previous one stays in effect), a
    /// dialogue, or an explicit "nothing to say" that also silences the character's own dialogues. Authored as absent,
    /// a dialogue ID, or <c>null</c>.
    /// </summary>
    [Serializable, ImportedData]
    public sealed class RoutineDialogue
    {
        [field: SerializeField] public bool Silent { get; private set; }
        [field: SerializeField, Validation.Reference(typeof(Core.Dialogue.Vulcanus.VulcanusDialogueAsset))]
        public string Id { get; private set; }

        /// <summary>Whether the routine says anything here; otherwise the dialogue in effect before stays.</summary>
        public bool IsSet => Silent || !string.IsNullOrEmpty(Id);

        public sealed class Converter : JsonConverter<RoutineDialogue>
        {
            public override RoutineDialogue ReadJson(JsonReader reader, Type objectType, RoutineDialogue existingValue,
                bool hasExistingValue, JsonSerializer serializer)
            {
                var token = JToken.Load(reader);
                return token.Type == JTokenType.Null
                    ? new RoutineDialogue { Silent = true }
                    : new RoutineDialogue { Id = token.Value<string>() };
            }

            public override void WriteJson(JsonWriter writer, RoutineDialogue value, JsonSerializer serializer) =>
                throw new NotSupportedException("Routines are only read.");
        }
    }

    /// <summary>One stop of a day: when to set off, where to go and what to do there.</summary>
    [Serializable, ImportedData]
    public sealed class RoutineGoal
    {
        [field: SerializeField] public string Id { get; private set; }
        [field: SerializeField, JsonConverter(typeof(ClockTimeJsonConverter)), Tooltip("Minutes after midnight.")]
        public int DepartAt { get; private set; }
        /// <summary>Read-only Lua expression; empty means always.</summary>
        [field: SerializeField, Validation.LuaExpression] public string Condition { get; private set; }
        /// <summary>An empty place (no map) means the routine's home; see <see cref="ToHome"/>.</summary>
        [field: SerializeField, JsonConverter(typeof(RoutinePlace.DestinationJsonConverter)), Tooltip("Empty for the routine's home.")]
        public RoutinePlace Destination { get; private set; } = new();
        [field: SerializeField, Validation.Nested] public RoutineActivity Activity { get; private set; } = new();
        /// <summary>What the character is busy with while at this goal, such as "fishing"; empty for nothing in particular.</summary>
        [field: SerializeField, Tooltip("What the character is busy with here, such as fishing.")] public string Occupation { get; private set; }
        /// <summary>Dialogue while walking to this goal; unset keeps the dialogue in effect before.</summary>
        [field: SerializeField, JsonConverter(typeof(RoutineDialogue.Converter)), Validation.Nested]
        public RoutineDialogue WalkingDialogue { get; private set; } = new();
        /// <summary>Dialogue once arrived; unset keeps the dialogue in effect before.</summary>
        [field: SerializeField, JsonConverter(typeof(RoutineDialogue.Converter)), Validation.Nested]
        public RoutineDialogue Dialogue { get; private set; } = new();

        public bool ToHome => string.IsNullOrEmpty(Destination.Map);
        /// <summary>Character animation played at the destination; empty for none.</summary>
        public string ActivityAnimationId => Activity.Animation;
    }

    /// <summary>Goals for one kind of day: an override, a variant or a member of a <c>pickOne</c> pool.</summary>
    [Serializable, ImportedData]
    public abstract class RoutineDay
    {
        [field: SerializeField] public string Id { get; private set; }
        /// <summary>Read-only Lua expression; empty means always.</summary>
        [field: SerializeField, Validation.LuaExpression] public string Condition { get; private set; }
        [field: SerializeField, Validation.Nested] public RoutineGoal[] Goals { get; private set; } = Array.Empty<RoutineGoal>();
    }

    /// <summary>A member of a <c>pickOne</c> pool.</summary>
    [Serializable, ImportedData]
    public sealed class RoutineChoice : RoutineDay
    {
        /// <summary>Relative chance of being chosen among the pool's matching members.</summary>
        [field: SerializeField] public float Weight { get; private set; } = 1f;
    }

    /// <summary>An override or variant: its own goals, or a pool of choices when <see cref="IsPool"/>.</summary>
    [Serializable, ImportedData]
    public sealed class RoutineEntry : RoutineDay
    {
        [field: SerializeField, Validation.Nested] public RoutineChoice[] PickOne { get; private set; } = Array.Empty<RoutineChoice>();
        public bool IsPool => PickOne is { Length: > 0 };
    }

    /// <summary>An NPC's daily routine authored in Vulcanus (*.routine.json). Plan a day with <see cref="RoutinePlanner"/>.</summary>
    [ImportedData]
    [Core.Catalogs.DefinitionResource]
    public sealed class RoutineDefinition : Core.Catalogs.DefinitionScriptableObject<RoutineValidator>
    {
        [field: SerializeField, Validation.NamespacedId("The source requires the character's namespace:name ID.", Lowercase = true),
                Validation.Reference(typeof(global::Character.CharacterDefinition))]
        public string Character { get; private set; }
        [field: SerializeField, Validation.Required("The source requires a home.")] public RoutinePlace Home { get; private set; }
        /// <summary>Dialogue at the start of each day; unset leaves the character's own dialogues until a goal sets one.</summary>
        [field: SerializeField, JsonConverter(typeof(RoutineDialogue.Converter)), Validation.Nested]
        public RoutineDialogue Dialogue { get; private set; } = new();
        [field: SerializeField, Validation.Nested] public RoutineEntry[] Overrides { get; private set; } = Array.Empty<RoutineEntry>();
        [field: SerializeField, Validation.Nested] public RoutineEntry[] Variants { get; private set; } = Array.Empty<RoutineEntry>();
    }
}

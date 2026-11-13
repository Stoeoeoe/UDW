using System;
using Core.Common;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Core.Routines
{
    /// <summary>A map anchor a routine starts from or walks to.</summary>
    [Serializable]
    public sealed class RoutinePlace
    {
        [SerializeField, ReadOnly] private string mapId;
        [SerializeField, ReadOnly] private string anchorId;
        public string MapId => mapId;
        public string AnchorId => anchorId;

        public RoutinePlace(string mapId, string anchorId)
        {
            this.mapId = mapId;
            this.anchorId = anchorId;
        }

        public override string ToString() => $"{mapId}/{anchorId}";
    }

    /// <summary>One stop of a day: when to set off, where to go and what to do there.</summary>
    [Serializable]
    public sealed class RoutineGoal
    {
        [SerializeField, ReadOnly] private string id;
        [SerializeField, ReadOnly, Tooltip("Minutes after midnight.")] private int departMinute;
        [SerializeField, ReadOnly] private string condition;
        [SerializeField, ReadOnly, Tooltip("Goes to the routine's home instead of a destination.")] private bool toHome;
        [SerializeField, ReadOnly] private RoutinePlace destination;
        [SerializeField, ReadOnly] private string activityAnimationId;

        public string Id => id;
        public int DepartMinute => departMinute;
        /// <summary>Read-only Lua expression; empty means always.</summary>
        public string Condition => condition;
        public bool ToHome => toHome;
        /// <summary>Null when <see cref="ToHome"/>.</summary>
        public RoutinePlace Destination => toHome ? null : destination;
        /// <summary>Character animation played at the destination; empty for none.</summary>
        public string ActivityAnimationId => activityAnimationId;

        public RoutineGoal(string id, int departMinute, string condition, RoutinePlace destination, string activityAnimationId)
        {
            this.id = id;
            this.departMinute = departMinute;
            this.condition = condition ?? "";
            toHome = destination == null;
            this.destination = destination;
            this.activityAnimationId = activityAnimationId ?? "";
        }
    }

    /// <summary>Goals for one kind of day: an override, a variant or a member of a <c>pickOne</c> pool.</summary>
    [Serializable]
    public abstract class RoutineDay
    {
        [SerializeField, ReadOnly] private string id;
        [SerializeField, ReadOnly] private string condition;
        [SerializeField, ReadOnly] private RoutineGoal[] goals;

        public string Id => id;
        /// <summary>Read-only Lua expression; empty means always.</summary>
        public string Condition => condition;
        public RoutineGoal[] Goals => goals;

        protected RoutineDay(string id, string condition, RoutineGoal[] goals)
        {
            this.id = id;
            this.condition = condition ?? "";
            this.goals = goals ?? Array.Empty<RoutineGoal>();
        }
    }

    /// <summary>A member of a <c>pickOne</c> pool.</summary>
    [Serializable]
    public sealed class RoutineChoice : RoutineDay
    {
        [SerializeField, ReadOnly] private float weight;
        /// <summary>Relative chance of being chosen among the pool's matching members.</summary>
        public float Weight => weight;

        public RoutineChoice(string id, string condition, float weight, RoutineGoal[] goals) : base(id, condition, goals) =>
            this.weight = weight;
    }

    /// <summary>An override or variant: its own goals, or a pool of choices when <see cref="IsPool"/>.</summary>
    [Serializable]
    public sealed class RoutineEntry : RoutineDay
    {
        [SerializeField, ReadOnly] private RoutineChoice[] pickOne;
        public RoutineChoice[] PickOne => pickOne;
        public bool IsPool => pickOne is { Length: > 0 };

        public RoutineEntry(string id, string condition, RoutineGoal[] goals, RoutineChoice[] pickOne) : base(id, condition, goals) =>
            this.pickOne = pickOne ?? Array.Empty<RoutineChoice>();
    }

    /// <summary>An NPC's daily routine authored in Vulcanus (*.routine.json). Plan a day with <see cref="RoutinePlanner"/>.</summary>
    public sealed class RoutineDefinition : ValidatedScriptableObject<RoutineValidator>
    {
        [SerializeField, ReadOnly, Validation.NamespacedId("The source requires a lowercase namespace:name ID.", Lowercase = true)]
        private string routineId;
        [SerializeField, ReadOnly, Validation.NamespacedId("The source requires the character's namespace:name ID.", Lowercase = true)]
        private string characterId;
        [SerializeField, ReadOnly, Validation.Required("The source requires a home.")] private RoutinePlace home;
        [SerializeField, ReadOnly] private RoutineEntry[] overrides = Array.Empty<RoutineEntry>();
        [SerializeField, ReadOnly] private RoutineEntry[] variants = Array.Empty<RoutineEntry>();

        public string RoutineId => routineId;
        public string CharacterId => characterId;
        public RoutinePlace Home => home;
        public RoutineEntry[] Overrides => overrides;
        public RoutineEntry[] Variants => variants;

#if UNITY_EDITOR
        public void Configure(string id, string character, RoutinePlace homePlace, RoutineEntry[] overrideEntries,
            RoutineEntry[] variantEntries)
        {
            routineId = id;
            characterId = character;
            home = homePlace;
            overrides = overrideEntries ?? Array.Empty<RoutineEntry>();
            variants = variantEntries ?? Array.Empty<RoutineEntry>();
            RequireValidConfiguration();
        }
#endif
    }
}

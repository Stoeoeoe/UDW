using System;
using System.Collections.Generic;
using System.Linq;
using Core.Scripting;
using UnityEngine;
using Util;

namespace Core.Routines
{
    /// <summary>A goal of the planned day, with "home" already resolved to the routine's home.</summary>
    public sealed class PlannedGoal
    {
        public string Id { get; }
        public int DepartMinute { get; }
        public RoutinePlace Destination { get; }
        /// <summary>Character animation played at the destination; empty for none.</summary>
        public string ActivityAnimationId { get; }
        /// <summary>Dialogue while walking here; empty keeps the one in effect before.</summary>
        public string WalkingDialogueId { get; }
        /// <summary>Dialogue once arrived; empty keeps the one in effect before.</summary>
        public string DialogueId { get; }

        internal PlannedGoal(RoutineGoal goal, RoutinePlace home)
        {
            WalkingDialogueId = goal.WalkingDialogueId;
            DialogueId = goal.DialogueId;
            Id = goal.Id;
            DepartMinute = goal.DepartMinute;
            Destination = goal.ToHome ? home : goal.Destination;
            ActivityAnimationId = goal.ActivityAnimationId;
        }
    }

    /// <summary>One character's goals for one day. It depends only on the morning's choices, so it can be rebuilt after loading.</summary>
    public sealed class DayPlan
    {
        public RoutineDefinition Routine { get; }
        /// <summary>The chosen override, variant or pool member.</summary>
        public string ChoiceId { get; }
        public IReadOnlyList<PlannedGoal> Goals { get; }

        internal DayPlan(RoutineDefinition routine, string choiceId, IReadOnlyList<PlannedGoal> goals)
        {
            Routine = routine;
            ChoiceId = choiceId;
            Goals = goals;
        }

        /// <summary>
        /// The dialogue in effect: the newest one the day has set so far, starting from the routine's own. Walking to a goal
        /// and then being there can each set one. Null when none is set.
        /// </summary>
        /// <param name="goalIndex">The goal most recently set off for; -1 at home before the first departure.</param>
        /// <param name="arrived">Whether that goal's destination has been reached.</param>
        public string DialogueAt(int goalIndex, bool arrived)
        {
            if (goalIndex < -1 || goalIndex >= Goals.Count) throw new ArgumentOutOfRangeException(nameof(goalIndex));
            for (var i = goalIndex; i >= 0; i--)
            {
                if ((i < goalIndex || arrived) && !string.IsNullOrEmpty(Goals[i].DialogueId)) return Goals[i].DialogueId;
                if (!string.IsNullOrEmpty(Goals[i].WalkingDialogueId)) return Goals[i].WalkingDialogueId;
            }
            return string.IsNullOrEmpty(Routine.DialogueId) ? null : Routine.DialogueId;
        }
    }

    /// <summary>
    /// Chooses each character's day: the first matching override, otherwise the first matching variant. A pool picks one
    /// of its matching members by weight, the same way for a character and day every time. Goals whose condition is false
    /// are left out.
    /// </summary>
    public sealed class RoutinePlanner
    {
        private readonly VulcanusLuaEngine _conditions;

        /// <param name="conditions">Evaluates the routine's read-only conditions against the current game state.</param>
        public RoutinePlanner(VulcanusLuaEngine conditions) =>
            _conditions = conditions ?? throw new ArgumentNullException(nameof(conditions));

        public DayPlan PlanDay(RoutineDefinition routine, int daysSinceStart)
        {
            if (!routine) throw new ArgumentNullException(nameof(routine));
            var day = Choose(routine.Overrides, routine.CharacterId, daysSinceStart)
                ?? Choose(routine.Variants, routine.CharacterId, daysSinceStart)
                ?? throw new InvalidOperationException($"Routine '{routine.RoutineId}' has no variant without a condition.");
            var goals = day.Goals.Where(goal => _conditions.EvaluateCondition(goal.Condition))
                .Select(goal => new PlannedGoal(goal, routine.Home)).ToArray();
            return new DayPlan(routine, day.Id, goals);
        }

        /// <summary>The first entry whose condition holds; a pool without a matching member is skipped.</summary>
        private RoutineDay Choose(RoutineEntry[] entries, string characterId, int daysSinceStart)
        {
            foreach (var entry in entries)
            {
                if (!_conditions.EvaluateCondition(entry.Condition)) continue;
                if (!entry.IsPool) return entry;
                var matching = entry.PickOne.Where(choice => _conditions.EvaluateCondition(choice.Condition)).ToArray();
                if (matching.Length > 0)
                    return MathUtils.PickWeighted(matching, choice => choice.Weight, DailySample(characterId, daysSinceStart));
            }
            return null;
        }

        /// <summary>
        /// A number in [0, 1) that is the same for a character and day every time, so loading mid-day reproduces the choice.
        /// TODO(STO-80): include the per-save seed once GameSaveData has one, so playthroughs differ.
        /// </summary>
        internal static double DailySample(string characterId, int daysSinceStart)
        {
            // Hash128 is stable across runs, unlike string.GetHashCode.
            var seed = Hash128.Compute($"{characterId}|{daysSinceStart}").GetHashCode();
            return new System.Random(seed).NextDouble();
        }
    }
}

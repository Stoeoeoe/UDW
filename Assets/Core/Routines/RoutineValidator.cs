using System;
using System.Collections.Generic;
using Core.Common;

namespace Core.Routines
{
    /// <summary>Checks the rules a routine's schema cannot express: reachability, unique IDs and time order.</summary>
    public sealed class RoutineValidator : ScriptableObjectValidator<RoutineDefinition>
    {
        public const int MinutesPerDay = 24 * 60;

        protected override void CollectConfigurationErrors(RoutineDefinition asset, List<ConfigurationError> errors)
        {
            if (asset.Home != null) CheckPlace(errors, asset, "Home", asset.Home);
            if (asset.Overrides == null || asset.Variants == null) return; // Attribute validation reports missing data.
            if (asset.Variants.Length == 0) Report(errors, asset, "Variants", "A routine needs at least one variant.");

            var entryIds = new HashSet<string>(StringComparer.Ordinal);
            CheckEntries(errors, asset, "Overrides", asset.Overrides, entryIds, overrides: true);
            CheckEntries(errors, asset, "Variants", asset.Variants, entryIds, overrides: false);
        }

        private static void CheckEntries(List<ConfigurationError> errors, RoutineDefinition asset, string list,
            RoutineEntry[] entries, HashSet<string> entryIds, bool overrides)
        {
            string fallback = null;
            for (var i = 0; i < entries.Length; i++)
            {
                var entry = entries[i];
                var path = $"{list}[{i}]";
                if (entry == null) { Report(errors, asset, path, "Missing entry."); continue; }
                if (!entryIds.Add(entry.Id)) Report(errors, asset, path, $"Entry ID '{entry.Id}' is used more than once.");
                if (fallback != null)
                    Report(errors, asset, path, $"Entry '{entry.Id}' can never be chosen: '{fallback}' before it has no condition.");
                if (string.IsNullOrWhiteSpace(entry.Condition))
                {
                    if (overrides)
                        Report(errors, asset, path, $"Override '{entry.Id}' needs a condition; without one it replaces every day.");
                    else if (!CanBeSkipped(entry)) fallback ??= entry.Id;
                }

                if (entry.IsPool)
                {
                    for (var c = 0; c < entry.PickOne.Length; c++)
                    {
                        var choice = entry.PickOne[c];
                        var choicePath = $"{path}.PickOne[{c}]";
                        if (choice == null) { Report(errors, asset, choicePath, "Missing pool member."); continue; }
                        if (!entryIds.Add(choice.Id)) Report(errors, asset, choicePath, $"Entry ID '{choice.Id}' is used more than once.");
                        if (!ConfigurationRules.IsFinite(choice.Weight) || choice.Weight <= 0)
                            Report(errors, asset, choicePath, "Weight must be a positive number.");
                        CheckGoals(errors, asset, choicePath, choice.Goals);
                    }
                }
                else CheckGoals(errors, asset, path, entry.Goals);
            }
            if (!overrides && fallback == null && entries.Length > 0)
                Report(errors, asset, list, "At least one variant needs no condition, so every day has a routine.");
        }

        /// <summary>A pool whose members all have conditions is skipped when none of them match, so it is no fallback.</summary>
        private static bool CanBeSkipped(RoutineEntry entry) =>
            entry.IsPool && Array.TrueForAll(entry.PickOne, choice => choice != null && !string.IsNullOrWhiteSpace(choice.Condition));

        private static void CheckGoals(List<ConfigurationError> errors, RoutineDefinition asset, string path, RoutineGoal[] goals)
        {
            if (goals == null) { Report(errors, asset, path, "Missing goals."); return; }
            var ids = new HashSet<string>(StringComparer.Ordinal);
            var previous = -1;
            for (var i = 0; i < goals.Length; i++)
            {
                var goal = goals[i];
                var goalPath = $"{path}.Goals[{i}]";
                if (goal == null) { Report(errors, asset, goalPath, "Missing goal."); continue; }
                if (!DefinitionIdRules.IsPresent(goal.Id) || !ids.Add(goal.Id))
                    Report(errors, asset, goalPath, $"Goal IDs must be present and unique within their list ('{goal.Id}').");
                if (goal.DepartAt < 0 || goal.DepartAt >= MinutesPerDay)
                    Report(errors, asset, goalPath, "Departure must be a time of day.");
                else if (goal.DepartAt <= previous)
                    Report(errors, asset, goalPath, $"Goal '{goal.Id}' must depart after the goal before it.");
                previous = Math.Max(previous, goal.DepartAt);
                if (!goal.ToHome)
                {
                    CheckPlace(errors, asset, goalPath + ".Destination", goal.Destination, allowEntity: true);
                    if (goal.Destination is { IsEntity: true } && !string.IsNullOrEmpty(goal.ActivityAnimationId))
                        Report(errors, asset, goalPath, $"Goal '{goal.Id}' uses a slot, which supplies the animation; remove its activity.");
                }
            }
        }

        private static void CheckPlace(List<ConfigurationError> errors, RoutineDefinition asset, string path, RoutinePlace place,
            bool allowEntity = false)
        {
            if (place == null || !DefinitionIdRules.IsPresent(place.Map))
                Report(errors, asset, path, "A place needs a map.");
            else if (DefinitionIdRules.IsPresent(place.Anchor) == place.IsEntity)
                Report(errors, asset, path, "A place needs an anchor" + (allowEntity ? " or an entity, not both." : "."));
            else if (place.IsEntity && !allowEntity)
                Report(errors, asset, path, "A place needs an anchor.");
        }
    }
}

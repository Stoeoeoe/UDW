using System.Collections.Generic;
using System.Linq;
using Core.Common;

namespace Core.Quests
{
    /// <summary>
    /// A quest's field rules are annotations on <see cref="QuestDefinition"/> and the types it contains; this adds what
    /// crosses steps: where steps and objectives continue to.
    /// </summary>
    public sealed class QuestValidator : ScriptableObjectValidator<QuestDefinition>
    {
        protected override void CollectConfigurationErrors(QuestDefinition asset, List<ConfigurationError> errors)
        {
            var ids = asset.Steps.Select(step => step.Id).ToHashSet();
            if (ids.Contains(QuestStep.End))
                errors.Add(new ConfigurationError(asset, nameof(QuestDefinition.Steps), $"A step cannot be called '{QuestStep.End}'; it names the end of the quest."));

            var known = true;
            foreach (var step in asset.Steps)
                foreach (var next in Targets(step).Append(step.Next).Where(next => !string.IsNullOrEmpty(next)))
                    if (next != QuestStep.End && !ids.Contains(next))
                    {
                        known = false;
                        errors.Add(new ConfigurationError(asset, nameof(QuestDefinition.Steps), $"Step '{step.Id}' continues to the unknown step '{next}'."));
                    }

            // A loop would never reach the end. Lua jumps can't be seen here, so only the authored ones count.
            if (known && HasLoop(asset)) errors.Add(new ConfigurationError(asset, nameof(QuestDefinition.Steps), "The steps loop back on themselves; every path must reach the end."));
        }

        /// <summary>Where a step can go besides its own next: its branching objectives and conditional branches.</summary>
        private static IEnumerable<string> Targets(QuestStep step) =>
            step.Objectives.Where(objective => objective.Branches).Select(objective => objective.Next)
                .Concat(step.NextIf.Select(branch => branch.Next));

        private static bool HasLoop(QuestDefinition quest)
        {
            var open = new HashSet<string>();
            var done = new HashSet<string>();
            bool Visit(QuestStep step)
            {
                if (open.Contains(step.Id)) return true;
                if (!done.Add(step.Id)) return false;
                open.Add(step.Id);
                var targets = Targets(step).Append(quest.DefaultNextStepId(step)).Where(next => next != QuestStep.End);
                var loops = targets.Any(next => Visit(quest.Steps.First(candidate => candidate.Id == next)));
                open.Remove(step.Id);
                return loops;
            }
            return quest.Steps.Any(Visit);
        }
    }
}

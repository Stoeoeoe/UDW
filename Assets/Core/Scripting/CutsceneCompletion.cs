using System;
using System.Collections.Generic;
using System.Linq;
using Core.Common;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>Default outcome and final actor placements shared by watching and skipping.</summary>
    [Serializable]
    public sealed class CutsceneCompletion
    {
        [SerializeField] private string outcome = "completed";
        [SerializeField] private CutsceneActorOutcome[] actorOutcomes;
        public string Outcome => outcome;
        public IReadOnlyList<CutsceneActorOutcome> ActorOutcomes => Array.AsReadOnly(actorOutcomes);

        public CutsceneCompletion(CutsceneActorOutcome[] actorOutcomes, string outcome = "completed")
        {
            this.outcome = outcome;
            this.actorOutcomes = (CutsceneActorOutcome[])actorOutcomes.Clone();
        }

        internal void Validate(CutsceneDefinition owner, List<ConfigurationError> errors)
        {
            if (string.IsNullOrWhiteSpace(outcome))
                errors.Add(new ConfigurationError(owner, "completion.outcome", "Requires a non-empty outcome."));
            if (actorOutcomes == null || actorOutcomes.Any(outcome => outcome == null ||
                    string.IsNullOrWhiteSpace(outcome.Actor) || string.IsNullOrWhiteSpace(outcome.Anchor)) ||
                actorOutcomes.Select(outcome => outcome.Actor).Distinct(StringComparer.Ordinal).Count() != actorOutcomes.Length)
                errors.Add(new ConfigurationError(owner, "completion.actorOutcomes", "Requires unique actors and an anchor for each endpoint; an empty list is allowed."));
        }
    }

    [Serializable]
    public sealed class CutsceneActorOutcome
    {
        [SerializeField] private string actor;
        [SerializeField] private string anchor;
        public string Actor => actor;
        public string Anchor => anchor;
        public CutsceneActorOutcome(string actor, string anchor) { this.actor = actor; this.anchor = anchor; }
    }
}

using System;
using System.Collections.Generic;
using System.Linq;
using Core.Common;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>Persistent outcomes shared by watching and skipping. Unlisted actors return to their starting placement.</summary>
    [Serializable]
    public sealed class CutsceneCompletion
    {
        [SerializeField] private string flag;
        [SerializeField] private string[] setFlags;
        [SerializeField] private CutsceneActorOutcome[] actorOutcomes;
        public string Flag => flag;
        public IReadOnlyList<string> SetFlags => Array.AsReadOnly(setFlags);
        public IReadOnlyList<CutsceneActorOutcome> ActorOutcomes => Array.AsReadOnly(actorOutcomes);

        public CutsceneCompletion(string flag, string[] setFlags, CutsceneActorOutcome[] actorOutcomes)
        {
            this.flag = flag;
            this.setFlags = (string[])setFlags.Clone();
            this.actorOutcomes = (CutsceneActorOutcome[])actorOutcomes.Clone();
        }

        internal void Validate(CutsceneDefinition owner, List<ConfigurationError> errors)
        {
            // Empty flag explicitly means repeatable; it is never invented from a filename or display name.
            if (flag == null || (flag.Length > 0 && string.IsNullOrWhiteSpace(flag)))
                errors.Add(new ConfigurationError(owner, "completion.flag", "Requires a non-empty flag, or an empty string for repeatable scenes."));
            if (setFlags == null || setFlags.Any(string.IsNullOrWhiteSpace) || setFlags.Distinct(StringComparer.Ordinal).Count() != setFlags.Length)
                errors.Add(new ConfigurationError(owner, "completion.setFlags", "Requires unique non-empty flags; an empty list is allowed."));
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

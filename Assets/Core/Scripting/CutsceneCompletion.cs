using System;
using System.Collections.Generic;
using System.Linq;
using Core.Common;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>Immediate actions and final actor placements shared by watching and skipping.</summary>
    [Serializable]
    public sealed class CutsceneCompletion
    {
        [SerializeField] private string actions;
        [SerializeField] private CutsceneActorPlacement[] actorPlacements;
        public string Actions => actions;
        public IReadOnlyList<CutsceneActorPlacement> ActorPlacements => Array.AsReadOnly(actorPlacements);

        public CutsceneCompletion(CutsceneActorPlacement[] actorPlacements, string actions = "")
        {
            this.actions = actions;
            this.actorPlacements = (CutsceneActorPlacement[])actorPlacements.Clone();
        }

        internal void Validate(CutsceneDefinition owner, List<ConfigurationError> errors)
        {
            if (actions == null)
                errors.Add(new ConfigurationError(owner, "onComplete.actions", "Requires a Lua action block; an empty string is allowed."));
            if (actorPlacements == null || actorPlacements.Any(placement => placement == null ||
                    string.IsNullOrWhiteSpace(placement.Actor) || string.IsNullOrWhiteSpace(placement.Anchor)) ||
                actorPlacements.Select(placement => placement.Actor).Distinct(StringComparer.Ordinal).Count() != actorPlacements.Length)
                errors.Add(new ConfigurationError(owner, "onComplete.actorPlacements", "Requires unique actors and an anchor for each endpoint; an empty list is allowed."));
        }
    }

    [Serializable]
    public sealed class CutsceneActorPlacement
    {
        [SerializeField] private string actor;
        [SerializeField] private string anchor;
        public string Actor => actor;
        public string Anchor => anchor;
        public CutsceneActorPlacement(string actor, string anchor) { this.actor = actor; this.anchor = anchor; }
    }
}

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
        [SerializeField] private string lua = "";
        [SerializeField] private CutsceneStep[] steps = Array.Empty<CutsceneStep>();
        public string Actions => actions;
        public IReadOnlyList<CutsceneActorPlacement> ActorPlacements => Array.AsReadOnly(actorPlacements);
        public string Lua => lua;
        public IReadOnlyList<CutsceneStep> Steps => Array.AsReadOnly(steps);

        public CutsceneCompletion(CutsceneActorPlacement[] actorPlacements, string actions, string lua, CutsceneStep[] steps)
        {
            this.actions = actions;
            this.actorPlacements = (CutsceneActorPlacement[])actorPlacements.Clone();
            this.lua = lua;
            this.steps = (CutsceneStep[])steps.Clone();
        }

        internal void Validate(CutsceneDefinition owner, List<ConfigurationError> errors)
        {
            if (actions == null)
                errors.Add(new ConfigurationError(owner, "onComplete.actions", "Requires a Lua action block; an empty string is allowed."));
            if (steps == null || lua == null || (steps.Length > 0 && string.IsNullOrWhiteSpace(lua)))
                errors.Add(new ConfigurationError(owner, "onComplete.steps", "Requires compiled completion steps; an empty list and script are allowed."));
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

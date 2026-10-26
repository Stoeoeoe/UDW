using System;
using System.Collections.Generic;
using System.Linq;
using Core.Common;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>Immediate actions and final character placements shared by watching and skipping.</summary>
    [Serializable]
    public sealed class CutsceneCompletion
    {
        [SerializeField] private string actions;
        [SerializeField] private CutsceneCharacterPlacement[] characterPlacements;
        [SerializeField] private string lua = "";
        [SerializeField] private CutsceneStep[] steps = Array.Empty<CutsceneStep>();
        public string Actions => actions;
        public IReadOnlyList<CutsceneCharacterPlacement> CharacterPlacements => Array.AsReadOnly(characterPlacements);
        public string Lua => lua;
        public IReadOnlyList<CutsceneStep> Steps => Array.AsReadOnly(steps);

        public CutsceneCompletion(CutsceneCharacterPlacement[] characterPlacements, string actions, string lua, CutsceneStep[] steps)
        {
            this.actions = actions;
            this.characterPlacements = (CutsceneCharacterPlacement[])characterPlacements.Clone();
            this.lua = lua;
            this.steps = (CutsceneStep[])steps.Clone();
        }

        internal void Validate(CutsceneDefinition owner, List<ConfigurationError> errors)
        {
            if (actions == null)
                errors.Add(new ConfigurationError(owner, "onComplete.actions", "Requires a Lua action block; an empty string is allowed."));
            if (steps == null || lua == null || (steps.Length > 0 && string.IsNullOrWhiteSpace(lua)))
                errors.Add(new ConfigurationError(owner, "onComplete.steps", "Requires compiled completion steps; an empty list and script are allowed."));
            if (characterPlacements == null || characterPlacements.Any(placement => placement == null ||
                    string.IsNullOrWhiteSpace(placement.Character) || !placement.HasValidPosition) ||
                characterPlacements.Select(placement => placement.Character).Distinct(StringComparer.Ordinal).Count() != characterPlacements.Length)
                errors.Add(new ConfigurationError(owner, "onComplete.characterPlacements", "Requires unique characters and a valid anchor or pixel position for each endpoint; an empty list is allowed."));
        }
    }

    [Serializable]
    public sealed class CutsceneCharacterPlacement
    {
        [SerializeField] private string character;
        [SerializeField] private string anchor;
        [SerializeField] private MapPosition position;
        [SerializeField] private bool hasPosition;
        public string Character => character;
        public string Anchor => anchor;
        public MapPosition Position => hasPosition ? position : new MapPosition(anchor);
        internal bool HasValidPosition => hasPosition
            ? !position.IsAnchor && double.IsFinite(position.X) && double.IsFinite(position.Y) && position.X >= 0 && position.Y >= 0
            : !string.IsNullOrWhiteSpace(anchor);
        public CutsceneCharacterPlacement(string character, string anchor) { this.character = character; this.anchor = anchor; }
        public CutsceneCharacterPlacement(string character, MapPosition position)
        {
            this.character = character;
            this.position = position;
            hasPosition = !position.IsAnchor;
            anchor = position.IsAnchor ? position.Anchor : null;
        }
    }
}

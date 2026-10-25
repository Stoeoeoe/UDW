using System;
using System.Collections.Generic;
using System.Linq;
using Core.Common;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>The compiled script and authored step IDs imported from one cutscene source.</summary>
    public sealed class CutsceneDefinition : ValidatedScriptableObject
    {
        [SerializeField, ReadOnly] private string cutsceneId;
        [SerializeField, ReadOnly] private string mapId;
        [SerializeField, ReadOnly, TextArea] private string lua;
        [SerializeField, ReadOnly] private CutsceneStep[] steps = Array.Empty<CutsceneStep>();
        [SerializeField, ReadOnly] private bool allowSkip;
        [SerializeField, ReadOnly] private CutsceneCompletion onComplete;
        [SerializeField, ReadOnly, TextArea] private string onStartLua = "";
        [SerializeField, ReadOnly] private CutsceneStep[] onStart = Array.Empty<CutsceneStep>();
        [NonSerialized] private IReadOnlyList<CutsceneStep> _steps;
        [NonSerialized] private IReadOnlyList<CutsceneStep> _onStart;

        public string CutsceneId => cutsceneId;
        public string MapId => mapId;
        public string Lua => lua;
        public bool AllowSkip => allowSkip;
        public CutsceneCompletion OnComplete => onComplete;
        public IReadOnlyList<CutsceneStep> Steps => _steps ??= Array.AsReadOnly(steps);
        public string OnStartLua => onStartLua;
        public IReadOnlyList<CutsceneStep> OnStart => _onStart ??= Array.AsReadOnly(onStart);

#if UNITY_EDITOR
        public void Configure(string id, string map, string script, IEnumerable<CutsceneStep> importedSteps,
            bool skipAllowed, CutsceneCompletion completionPlan, string setupScript, IEnumerable<CutsceneStep> setupSteps)
        {
            cutsceneId = id;
            mapId = map;
            lua = script;
            steps = importedSteps.ToArray();
            _steps = null;
            allowSkip = skipAllowed;
            onComplete = completionPlan;
            onStartLua = setupScript;
            onStart = setupSteps.ToArray();
            _onStart = null;
            RequireValidConfiguration();
        }
#endif

        public override IReadOnlyList<ConfigurationError> ValidateConfiguration()
        {
            var errors = new List<ConfigurationError>();
            if (onComplete == null) errors.Add(new ConfigurationError(this, "onComplete", "Requires an explicit completion block."));
            else onComplete.Validate(this, errors);
            if (!DefinitionIdRules.IsNamespaced(cutsceneId))
                errors.Add(new ConfigurationError(this, "cutsceneId", "Requires a permanent namespace:name ID."));
            if (string.IsNullOrWhiteSpace(mapId))
                errors.Add(new ConfigurationError(this, "mapId", "Requires its authored map ID."));
            if (string.IsNullOrWhiteSpace(lua))
                errors.Add(new ConfigurationError(this, "lua", "Requires the compiled sequence."));
            if (steps == null || steps.Length == 0)
                errors.Add(new ConfigurationError(this, "steps", "Requires its authored steps."));
            if (onStart == null || onStartLua == null || (onStart.Length > 0 && string.IsNullOrWhiteSpace(onStartLua)))
                errors.Add(new ConfigurationError(this, "onStart", "Requires compiled setup steps; an empty list and script are allowed."));
            // Step structure and action signatures are checked by the source compiler before import.
            return errors;
        }
    }
}

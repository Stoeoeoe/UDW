using System;
using System.Collections.Generic;
using Core.Common;
using Sirenix.OdinInspector;
using UnityEngine;
#if UNITY_EDITOR
using System.Linq;
#endif

namespace Core.Scripting
{
    /// <summary>The compiled script and authored step IDs imported from one cutscene source.</summary>
    [Core.Catalogs.DefinitionResource(IdFormat = Core.Catalogs.DefinitionIdFormat.Namespaced)]
    public sealed class CutsceneDefinition : Core.Catalogs.DefinitionScriptableObject, ISerializationCallbackReceiver
    {
        [SerializeField, ReadOnly] private string mapId;
        [SerializeField, ReadOnly, TextArea] private string lua;
        [SerializeField, ReadOnly] private CutsceneStep[] steps = Array.Empty<CutsceneStep>();
        [SerializeField, ReadOnly] private bool allowSkip;
        [SerializeField, ReadOnly] private CutsceneTransition transition = new();
        [SerializeField, ReadOnly] private CutsceneCompletion onComplete;
        [SerializeField, ReadOnly, TextArea] private string onStartLua = "";
        [SerializeField, ReadOnly] private CutsceneStep[] onStart = Array.Empty<CutsceneStep>();
        [NonSerialized] private IReadOnlyList<CutsceneStep> _steps;
        [NonSerialized] private IReadOnlyList<CutsceneStep> _onStart;
        [SerializeField, ReadOnly] private CutsceneVariableDefinition[] variables = Array.Empty<CutsceneVariableDefinition>();
        public IReadOnlyList<CutsceneVariableDefinition> Variables => variables;
        public string MapId => mapId;
        public string Lua => lua;
        public bool AllowSkip => allowSkip;
        public CutsceneTransition Transition => transition;
        public CutsceneCompletion OnComplete => onComplete;
        public IReadOnlyList<CutsceneStep> Steps => _steps ??= Array.AsReadOnly(steps);
        public string OnStartLua => onStartLua;
        public IReadOnlyList<CutsceneStep> OnStart => _onStart ??= Array.AsReadOnly(onStart);

        public void OnBeforeSerialize() { }

        public void OnAfterDeserialize()
        {
            // Reimport replaces serialized arrays on the existing asset instance.
            // Playback must bind the steps that belong to the newly compiled Lua.
            _steps = null;
            _onStart = null;
        }

#if UNITY_EDITOR
        public void Configure(string id, string map, string script, IEnumerable<CutsceneStep> importedSteps,
            bool skipAllowed, CutsceneCompletion completionPlan, string setupScript, IEnumerable<CutsceneStep> setupSteps,
            CutsceneTransition presentation = null, CutsceneVariableDefinition[] localVariables = null)
        {
            SetId(id);
            mapId = map;
            lua = script;
            steps = importedSteps.ToArray();
            _steps = null;
            allowSkip = skipAllowed;
            transition = presentation ?? new CutsceneTransition();
            onComplete = completionPlan;
            onStartLua = setupScript;
            onStart = setupSteps.ToArray();
            _onStart = null;
            variables = localVariables ?? Array.Empty<CutsceneVariableDefinition>();
            RequireValidConfiguration();
        }
#endif

        public override IReadOnlyList<ConfigurationError> ValidateConfiguration()
        {
            var errors = new List<ConfigurationError>(base.ValidateConfiguration());
            if (transition == null)
                errors.Add(new ConfigurationError(this, "transition", "Requires an explicit transition selection."));
            if (onComplete == null) errors.Add(new ConfigurationError(this, "onComplete", "Requires an explicit completion block."));
            else onComplete.Validate(this, errors);
            if (string.IsNullOrWhiteSpace(mapId))
                errors.Add(new ConfigurationError(this, "mapId", "Requires its authored map ID."));
            if (string.IsNullOrWhiteSpace(lua))
                errors.Add(new ConfigurationError(this, "lua", "Requires the compiled sequence."));
            if (steps == null || steps.Length == 0)
                errors.Add(new ConfigurationError(this, "steps", "Requires its authored steps."));
            if (onStart == null || onStartLua == null || (onStart.Length > 0 && string.IsNullOrWhiteSpace(onStartLua)))
                errors.Add(new ConfigurationError(this, "onStart", "Requires compiled setup steps; an empty list and script are allowed."));
            if (variables == null) errors.Add(new ConfigurationError(this, "variables", "Requires its variable declarations; an empty list is allowed."));
            else
                try { _ = new CutsceneVariables(variables); }
                catch (Exception error) { errors.Add(new ConfigurationError(this, "variables", error.Message)); }
            // Step structure and action signatures are checked by the source compiler before import.
            return errors;
        }
    }
}

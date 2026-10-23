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
        [SerializeField, ReadOnly] private CutsceneCompletion completion;
        [NonSerialized] private IReadOnlyList<CutsceneStep> _steps;

        public string CutsceneId => cutsceneId;
        public string MapId => mapId;
        public string Lua => lua;
        public bool AllowSkip => allowSkip;
        public CutsceneCompletion Completion => completion;
        public IReadOnlyList<CutsceneStep> Steps => _steps ??= Array.AsReadOnly(steps);

#if UNITY_EDITOR
        public void Configure(string id, string map, string script, IEnumerable<CutsceneStep> importedSteps,
            bool skipAllowed, CutsceneCompletion completionPlan)
        {
            cutsceneId = id;
            mapId = map;
            lua = script;
            steps = importedSteps.ToArray();
            _steps = null;
            allowSkip = skipAllowed;
            completion = completionPlan;
            RequireValidConfiguration();
        }
#endif

        public override IReadOnlyList<ConfigurationError> ValidateConfiguration()
        {
            var errors = new List<ConfigurationError>();
            if (completion == null) errors.Add(new ConfigurationError(this, "completion", "Requires an explicit terminal completion plan."));
            else completion.Validate(this, errors);
            if (!DefinitionIdRules.IsNamespaced(cutsceneId))
                errors.Add(new ConfigurationError(this, "cutsceneId", "Requires a permanent namespace:name ID."));
            if (string.IsNullOrWhiteSpace(mapId))
                errors.Add(new ConfigurationError(this, "mapId", "Requires its authored map ID."));
            if (string.IsNullOrWhiteSpace(lua))
                errors.Add(new ConfigurationError(this, "lua", "Requires the compiled sequence."));
            if (steps == null || steps.Length == 0)
                errors.Add(new ConfigurationError(this, "steps", "Requires its authored steps."));
            else
            {
                var ids = new HashSet<string>(StringComparer.Ordinal);
                foreach (var step in steps)
                {
                    if (step == null || string.IsNullOrWhiteSpace(step.Id) || !ids.Add(step.Id) || string.IsNullOrWhiteSpace(step.ActionId))
                    {
                        errors.Add(new ConfigurationError(this, "steps", "Requires unique authored step IDs and action IDs."));
                        continue;
                    }
                    if (!step.HasValidArguments())
                        errors.Add(new ConfigurationError(this, step.Id, "Requires non-empty named arguments without duplicate names."));
                }
                if (lua == null || lua.Count(character => character == '\n') != steps.Length)
                    errors.Add(new ConfigurationError(this, "steps", "Requires one authored step per compiled Lua line."));
            }
            return errors;
        }
    }
}

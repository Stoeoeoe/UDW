using System;
using System.Collections.Generic;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>Retains an authored action's references for validation before the Lua script starts.</summary>
    [Serializable]
    public sealed class CutsceneStep
    {
        [SerializeField, ReadOnly] private string id;
        [SerializeField, ReadOnly] private string actionId;
        [SerializeField, ReadOnly] private CutsceneArgument[] arguments;
        [NonSerialized] private IReadOnlyList<CutsceneArgument> _arguments;

        public string Id => id;
        public string ActionId => actionId;
        public IReadOnlyList<CutsceneArgument> Arguments => _arguments ??= Array.AsReadOnly(arguments);

        public CutsceneStep(string id, string actionId, CutsceneArgument[] arguments)
        {
            this.id = id;
            this.actionId = actionId;
            this.arguments = (CutsceneArgument[])arguments.Clone();
        }

    }

    [Serializable]
    public struct CutsceneArgument
    {
        [SerializeField, ReadOnly] private string name;
        [SerializeField, ReadOnly] private string value;
        public string Name => name;
        public string Value => value;
        public CutsceneArgument(string name, string value) { this.name = name; this.value = value; }
    }
}

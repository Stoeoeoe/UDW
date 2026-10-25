using System;
using System.Collections.Generic;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>Retains an authored action's arguments for validation before the Lua script starts.</summary>
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
        [SerializeField, ReadOnly] private MapPixelPosition position;
        [SerializeField, ReadOnly] private bool isPosition;
        public string Name => name;
        /// <summary>String contents or invariant numeric text. Position arguments use Position instead.</summary>
        public string Value => !isPosition ? value : throw new InvalidOperationException($"Argument '{name}' is a position, not text.");
        public MapPixelPosition Position => isPosition ? position : throw new InvalidOperationException($"Argument '{name}' is not a position.");
        public CutsceneArgument(string name, string value) { this.name = name; this.value = value; position = default; isPosition = false; }
        public CutsceneArgument(string name, MapPixelPosition position) { this.name = name; this.position = position; value = null; isPosition = true; }
    }
}

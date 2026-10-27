using System;
using System.Collections.Generic;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>Retains an authored action's arguments for validation before the Lua script starts.</summary>
    [Serializable]
    public sealed class CutsceneStep : ISerializationCallbackReceiver
    {
        [SerializeField, ReadOnly] private string id;
        [SerializeField, ReadOnly] private string actionId;
        [SerializeField, ReadOnly] private CutsceneArgument[] arguments;
        [NonSerialized] private IReadOnlyList<CutsceneArgument> _arguments;

        public string Id => id;
        public string ActionId => actionId;
        public bool IsCondition => actionId == "control.if";
        public IReadOnlyList<CutsceneArgument> Arguments => _arguments ??= Array.AsReadOnly(arguments);

        public void OnBeforeSerialize() { }
        public void OnAfterDeserialize() => _arguments = null;

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
        [SerializeField, ReadOnly] private MapPosition position;
        [SerializeField, ReadOnly] private bool isPosition;
        [SerializeField, ReadOnly] private MapPath path;
        // Inline Unity serialization materializes null MapPath fields; retain the authored kind explicitly.
        [SerializeField, ReadOnly] private bool isPath;
        [SerializeField, ReadOnly] private bool isNull;
        public string Name => name;
        public bool IsNull => isNull;
        /// <summary>String contents or invariant numeric text. Position arguments use Position instead.</summary>
        public string Value => !isPosition && !isPath ? value : throw new InvalidOperationException($"Argument '{name}' is a position or path, not text.");
        public MapPosition Position => isPosition ? position : throw new InvalidOperationException($"Argument '{name}' is not a position.");
        public MapPath Path => isPath && path != null ? path : throw new InvalidOperationException($"Argument '{name}' is not a path.");
        public CutsceneArgument(string name) { this.name = name; value = null; position = default; isPosition = false; path = null; isPath = false; isNull = true; }
        public CutsceneArgument(string name, string value) { this.name = name; this.value = value; position = default; isPosition = false; path = null; isPath = false; isNull = false; }
        public CutsceneArgument(string name, MapPosition position) { this.name = name; this.position = position; value = null; isPosition = true; path = null; isPath = false; isNull = false; }
        public CutsceneArgument(string name, MapPath path) { this.name = name; this.path = path ?? throw new ArgumentNullException(nameof(path)); value = null; position = default; isPosition = false; isPath = true; isNull = false; }
    }
}

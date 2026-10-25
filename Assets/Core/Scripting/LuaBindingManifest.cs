using System;
using System.Collections.Generic;

namespace Core.Scripting
{
    // Serializable contract for external dialogue/cutscene editors, not save data.
    [Serializable]
    public sealed class LuaBindingManifest
    {
        public int schemaVersion = 2;
        public LuaModuleDescription[] modules;
        public LuaTableDescription[] tables;
        public Dictionary<string, LuaResourceDescription[]> resources = new(StringComparer.Ordinal);
    }

    [Serializable]
    public sealed class LuaResourceDescription
    {
        public string id;
        public string description;
    }

    [Serializable]
    public sealed class LuaModuleDescription
    {
        public string path;
        public LuaMethodDescription[] methods;
    }

    [Serializable]
    public sealed class LuaMethodDescription
    {
        public string name;
        public LuaParameterDescription[] parameters;
        public string returnType;
        public bool returnNullable;
        public bool writesState;
        public LuaActionDescription action;
    }

    [Serializable]
    public sealed class LuaParameterDescription
    {
        public string name;
        public string type;
        public string semanticType;
        public string picker;
        public string resourceType;
        public string coordinateSpace;
        public string origin;
        public string[] placementModes;
        public string tileAnchor;
        public string actorPivot;
    }

    [Serializable]
    public sealed class LuaTableDescription
    {
        public string name;
        public LuaParameterDescription[] fields;
    }

    [Serializable]
    public sealed class LuaActionDescription
    {
        public string id;
        public string displayName;
        public string category;
        public string description;
        public string[] contexts;
        public string[] phases;
        public string execution;
        public LuaActionPreviewDescription preview;
    }

    [Serializable]
    public sealed class LuaActionPreviewDescription
    {
        public int version;
        public string spatialState;
        public LuaPreviewEffectDescription[] effects;
    }

    [Serializable]
    public sealed class LuaPreviewEffectDescription
    {
        public string kind;
        public string actorParameter;
        public string anchorParameter;
        public string targetActorParameter;
        public string dialogueParameter;
        public string directionParameter;
        public string positionParameter;
        public string facing;
    }
}

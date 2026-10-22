using System;

namespace Core.Scripting
{
    // Serializable contract for external dialogue/cutscene editors, not save data.
    [Serializable]
    public sealed class LuaBindingManifest
    {
        public int schemaVersion = 2;
        public LuaModuleDescription[] modules;
        public LuaTableDescription[] tables;
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
        public string execution;
        public string failure = "terminatesSession";
    }
}

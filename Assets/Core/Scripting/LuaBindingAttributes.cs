using System;
using UnityEngine.Scripting;

namespace Core.Scripting
{
    /// <summary>Names the Lua table containing an API, such as GameState.Story.</summary>
    [AttributeUsage(AttributeTargets.Class)]
    public sealed class LuaModuleAttribute : Attribute
    {
        public string Path { get; }
        public LuaModuleAttribute(string path) => Path = path;
    }

    /// <summary>Exposes a public instance method to synchronous Lua execution.</summary>
    /// <remarks>
    /// Read-only calls are also available to conditions. Use LuaAction instead for
    /// session methods, which can suspend Lua while a host action runs.
    /// PreserveAttribute keeps these reflection-only methods in stripped player builds.
    /// </remarks>
    [AttributeUsage(AttributeTargets.Method)]
    public sealed class LuaCallAttribute : PreserveAttribute
    {
        /// <summary>Excludes a synchronous call from conditions. Session access uses LuaAction contexts.</summary>
        public bool WritesState { get; }
        public LuaCallAttribute(bool writesState = false) => WritesState = writesState;
    }

    /// <summary>Allows a return object to be copied into a detached Lua table.</summary>
    [AttributeUsage(AttributeTargets.Class)]
    public sealed class LuaTableAttribute : PreserveAttribute { }

    /// <summary>Includes a primitive field in that Lua table snapshot.</summary>
    [AttributeUsage(AttributeTargets.Field)]
    public sealed class LuaFieldAttribute : PreserveAttribute { }
}

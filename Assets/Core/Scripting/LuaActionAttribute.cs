using System;

namespace Core.Scripting
{
    /// <summary>Opts a LuaCall method into session execution and visual-action metadata in the binding manifest.</summary>
    /// <remarks>
    /// Requires <see cref="LuaCallAttribute"/> on the same method. The registry validates
    /// the stable action ID, display metadata and allowed contexts before binding.
    /// Sessions expose only actions allowed in their context; ordinary LuaCall methods
    /// are not automatically available. Actions are excluded from synchronous execution
    /// and condition evaluation, including actions that complete immediately.
    /// A method returning <see cref="ILuaAction"/> suspends Lua until the host operation
    /// succeeds; cancellation or failure terminates the session without advancing.
    /// The operation stays in C# and its Lua return type is nil. Other supported return
    /// types complete immediately and use the ordinary Lua value conversion.
    /// Gameplay behavior and claim cleanup belong to the operation and execution session,
    /// not this attribute or the registry. This metadata does not implement an editor UI.
    /// </remarks>
    [AttributeUsage(AttributeTargets.Method)]
    public sealed class LuaActionAttribute : Attribute
    {
        /// <summary>Permanent authoring identity, unique across the registry; independent of the C# method name.</summary>
        public string Id { get; }
        public string DisplayName { get; }
        public string Category { get; }
        public string Description { get; }
        /// <summary>Allowed session contexts: cutscene and/or npcRoutine. No routine scheduler is implied.</summary>
        public string[] Contexts { get; }
        /// <summary>Optional check to run before playback. Takes the same arguments and returns void.</summary>
        /// <remarks>Required for actions with LuaReference arguments. Use nameof and mark the method [Preserve].</remarks>
        public string Validator { get; set; }
        public LuaActionAttribute(string id, string displayName, string category, string description, params string[] contexts)
        { Id = id; DisplayName = displayName; Category = category; Description = description; Contexts = contexts; }
    }

    /// <summary>Describes a string argument's semantic reference type and visual editor picker.</summary>
    /// <remarks>
    /// Supported pairs are actorRef/mapActor, anchorRef/mapAnchor and dialogueRef/dialogue.
    /// Registration validates the metadata; resolving IDs against live actors or authored
    /// content belongs to the action's binding boundary. No Unity object is passed through Lua.
    /// </remarks>
    [AttributeUsage(AttributeTargets.Parameter)]
    public sealed class LuaReferenceAttribute : Attribute
    {
        public string Type { get; }
        public string Picker { get; }
        public LuaReferenceAttribute(string type, string picker) { Type = type; Picker = picker; }
    }
}

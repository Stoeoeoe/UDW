using System;
using UnityEngine.Scripting;

namespace Core.Scripting
{
    /// <summary>Exposes a public instance method to session execution and visual-action metadata in the binding manifest.</summary>
    /// <remarks>
    /// Preserves the method in stripped player builds. The registry validates the
    /// stable action ID, display metadata and allowed contexts before binding.
    /// Sessions expose only actions allowed in their context; ordinary LuaCall methods
    /// are not automatically available. Actions are excluded from synchronous execution
    /// and condition evaluation, including actions that complete immediately.
    /// A method returning <see cref="ILuaAction"/> suspends Lua until the host operation
    /// completes; cancellation stops playback and errors propagate as exceptions.
    /// The operation stays in C# and its Lua return type is nil. Other supported return
    /// types complete immediately and use the ordinary Lua value conversion.
    /// Gameplay behavior and claim cleanup belong to the operation and execution session,
    /// not this attribute or the registry. This metadata does not implement an editor UI.
    /// </remarks>
    [AttributeUsage(AttributeTargets.Method)]
    public sealed class LuaActionAttribute : PreserveAttribute
    {
        /// <summary>Permanent authoring identity, unique across the registry; independent of the C# method name.</summary>
        public string Id { get; }
        public string DisplayName { get; }
        public string Category { get; }
        public string Description { get; }
        /// <summary>Allowed session contexts: cutscene and/or npcRoutine. No routine scheduler is implied.</summary>
        public string[] Contexts { get; }
        /// <summary>Optional check to run before playback. Takes the same arguments and returns void.</summary>
        /// <remarks>
        /// Required for actions with LuaReference or LuaResource arguments. Use nameof and mark the method [Preserve].
        /// Static validators check authored values at import without scene services; instance validators run at binding.
        /// </remarks>
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

    /// <summary>A string ID selected from the named resources list in bindings.json.</summary>
    /// <remarks>The exporter supplies choices; the action's validator resolves the selected ID before playback.</remarks>
    [AttributeUsage(AttributeTargets.Parameter)]
    public sealed class LuaResourceAttribute : Attribute
    {
        public string Type { get; }
        public LuaResourceAttribute(string type) => Type = type;
    }

    public enum LuaPreviewSpatialState { Described, Unknown }
    public enum LuaPreviewEffectKind { MoveActorToAnchor, FaceActorTowardActor, ShowDialogue }

    /// <summary>Declares schematic state after successful action completion, never a gameplay simulation.</summary>
    [AttributeUsage(AttributeTargets.Method)]
    public sealed class LuaPreviewAttribute : Attribute
    {
        public int Version { get; set; } = 1;
        public LuaPreviewSpatialState SpatialState { get; }
        public LuaPreviewAttribute(LuaPreviewSpatialState spatialState) => SpatialState = spatialState;
    }

    /// <summary>Maps one ordered visual effect to declared method parameters, not literal world IDs.</summary>
    /// <remarks>Order is nonnegative and unique per method. Only move effects require Facing = "unknown" in v1.</remarks>
    [AttributeUsage(AttributeTargets.Method, AllowMultiple = true)]
    public sealed class LuaPreviewEffectAttribute : Attribute
    {
        public int Order { get; }
        public LuaPreviewEffectKind Kind { get; }
        public string ActorParameter { get; set; }
        public string AnchorParameter { get; set; }
        public string TargetActorParameter { get; set; }
        public string DialogueParameter { get; set; }
        public string Facing { get; set; }

        public LuaPreviewEffectAttribute(int order, LuaPreviewEffectKind kind) { Order = order; Kind = kind; }
    }
}

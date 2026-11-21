using System;
using System.Collections.Generic;
using System.Linq;
using Core.Common;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Core.Dialogue.Vulcanus
{
    /// <summary>A Vulcanus dialogue: its node graph, read straight from *.runtime.dialogue.json, and its texts.</summary>
    [CreateAssetMenu(fileName = "VulcanusDialogue", menuName = "Game/Vulcanus/Dialogue")]
    [ImportedData]
    [Core.Catalogs.DefinitionResource(IdFormat = Core.Catalogs.DefinitionIdFormat.Any)]
    public sealed class VulcanusDialogueAsset : Core.Catalogs.DefinitionScriptableObject
    {
        /// <summary>A translated text, from the dialogue's sibling .i18n.json.</summary>
        [Serializable, ImportedData]
        public sealed class Message
        {
            [field: SerializeField] public string MsgKey { get; private set; }
            [field: SerializeField] public string Text { get; private set; }
        }

        internal const string NodesField = nameof(Nodes);
        [field: SerializeField, Validation.OneOf(NodesField, nameof(VulcanusDialogueNode.Id))] public string StartNodeId { get; private set; }
        [field: SerializeReference, Validation.Nested, Validation.Unique(nameof(VulcanusDialogueNode.Id)),
                JsonProperty(ItemConverterType = typeof(DialogueNodeJsonConverter))]
        public VulcanusDialogueNode[] Nodes { get; private set; } = Array.Empty<VulcanusDialogueNode>();
        [field: SerializeField] public Message[] Messages { get; private set; } = Array.Empty<Message>();

        [NonSerialized] private Dictionary<string, int> _nodeIndexById;
        [NonSerialized] private Dictionary<string, string> _textByKey;

        public bool TryGetNode(string nodeId, out VulcanusDialogueNode node)
        {
            node = nodeId != null && NodeIndexById.TryGetValue(nodeId, out var index) ? Nodes[index] : null;
            return node != null;
        }

        /// <summary>The next executable node in authored order, skipping comments.</summary>
        public bool TryGetExecutableNodeAfter(string nodeId, out VulcanusDialogueNode node)
        {
            var start = nodeId != null && NodeIndexById.TryGetValue(nodeId, out var index) ? index + 1 : 0;
            node = Nodes.Skip(start).FirstOrDefault(candidate => candidate.IsExecutable);
            return node != null;
        }

        public string ResolveLocalizedText(string msgKey, string fallbackText)
        {
            _textByKey ??= Messages.ToDictionary(message => message.MsgKey, message => message.Text);
            return !string.IsNullOrEmpty(msgKey) && _textByKey.TryGetValue(msgKey, out var text) && !string.IsNullOrEmpty(text)
                ? text : fallbackText ?? string.Empty;
        }

        private Dictionary<string, int> NodeIndexById =>
            _nodeIndexById ??= Nodes.Select((node, index) => (node.Id, index)).ToDictionary(entry => entry.Id, entry => entry.index);
    }

/// <summary>Reads a dialogue node as the class its "type" names.</summary>
    public sealed class DialogueNodeJsonConverter : JsonConverter
    {
        private static readonly Dictionary<string, Type> Types = new()
        {
            ["line"] = typeof(VulcanusDialogueLineNode),
            ["choice"] = typeof(VulcanusDialogueChoiceNode),
            ["action"] = typeof(VulcanusDialogueActionNode),
            ["jump"] = typeof(VulcanusDialogueJumpNode),
            ["comment"] = typeof(VulcanusDialogueCommentNode),
            ["end"] = typeof(VulcanusDialogueEndNode)
        };

        public override bool CanConvert(Type objectType) => typeof(VulcanusDialogueNode).IsAssignableFrom(objectType);

        public override object ReadJson(JsonReader reader, Type objectType, object existingValue, JsonSerializer serializer)
        {
            var json = JObject.Load(reader);
            var type = (string)json["type"];
            if (type == null || !Types.TryGetValue(type, out var nodeType))
                throw new FormatException($"Unknown dialogue node type '{type}'.");
            var node = Activator.CreateInstance(nodeType);
            serializer.Populate(json.CreateReader(), node);
            return node;
        }

        public override void WriteJson(JsonWriter writer, object value, JsonSerializer serializer) =>
            throw new NotSupportedException("Definitions are only read.");
    }

    [Serializable, ImportedData]
    public abstract class VulcanusDialogueNode
    {
        [field: SerializeField] public string Id { get; private set; }
        public virtual bool IsExecutable => true;
    }

    [Serializable, ImportedData]
    public sealed class VulcanusDialogueLineNode : VulcanusDialogueNode
    {
        [field: SerializeField, Tooltip("Leave empty for neutral text such as signs, boards or narration, without a portrait or nameplate.")]
        public string Speaker { get; private set; }
        [field: SerializeField] public string Emotion { get; private set; }
        [field: SerializeField] public string Text { get; private set; }
        [field: SerializeField] public string MsgKey { get; private set; }
        [field: SerializeField, Validation.OneOf(VulcanusDialogueAsset.NodesField, nameof(Id))] public string Next { get; private set; }
    }

    [Serializable, ImportedData]
    public sealed class VulcanusDialogueChoiceNode : VulcanusDialogueNode
    {
        [field: SerializeField, Validation.NotEmpty, Validation.Nested]
        public VulcanusDialogueChoiceOption[] Options { get; private set; } = Array.Empty<VulcanusDialogueChoiceOption>();
    }

    [Serializable, ImportedData]
    public sealed class VulcanusDialogueActionNode : VulcanusDialogueNode
    {
        [field: SerializeField, Validation.LuaChunk] public string Lua { get; private set; }
        [field: SerializeField, Validation.OneOf(VulcanusDialogueAsset.NodesField, nameof(Id))] public string Next { get; private set; }
    }

    [Serializable, ImportedData]
    public sealed class VulcanusDialogueJumpNode : VulcanusDialogueNode
    {
        [field: SerializeField, Tooltip("Empty jumps within this dialogue.")] public string TargetDialogueId { get; private set; }
        [field: SerializeField, Validation.NotEmpty,
                Validation.OneOf(VulcanusDialogueAsset.NodesField, nameof(Id), UnlessSet = nameof(TargetDialogueId))]
        public string TargetNodeId { get; private set; }
    }

    [Serializable, ImportedData]
    public sealed class VulcanusDialogueCommentNode : VulcanusDialogueNode
    {
        [field: SerializeField] public string Text { get; private set; }
        public override bool IsExecutable => false;
    }

    [Serializable]
    public sealed class VulcanusDialogueEndNode : VulcanusDialogueNode { }

    [Serializable, ImportedData]
    public sealed class VulcanusDialogueChoiceOption
    {
        [field: SerializeField] public string Id { get; private set; }
        [field: SerializeField] public string Text { get; private set; }
        [field: SerializeField] public string MsgKey { get; private set; }
        [field: SerializeField, Validation.LuaExpression] public string Condition { get; private set; }
        [field: SerializeField, Validation.NotEmpty, Validation.OneOf(VulcanusDialogueAsset.NodesField, nameof(VulcanusDialogueNode.Id))]
        public string TargetNodeId { get; private set; }
    }
}

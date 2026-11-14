using System;
using System.Collections.Generic;
using System.Linq;
using Core.Common;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Core.Dialogue.Vulcanus
{
    /// <summary>A Vulcanus dialogue: its node graph, read straight from *.runtime.dialogue.json, and its texts.</summary>
    [CreateAssetMenu(fileName = "VulcanusDialogue", menuName = "Game/Vulcanus/Dialogue")]
    public sealed class VulcanusDialogueAsset : ValidatedScriptableObject<VulcanusDialogueValidator>
    {
        /// <summary>A translated text, from the dialogue's sibling .i18n.json.</summary>
        [Serializable]
        public sealed class Message
        {
            [SerializeField] private string msgKey;
            [SerializeField] private string text;
            public string MsgKey => msgKey;
            public string Text => text;
        }

        internal const string NodesField = nameof(nodes);

        [SerializeField, ReadOnly] private string id;
        [SerializeField, ReadOnly, Validation.OneOf(NodesField, nameof(VulcanusDialogueNode.Id))] private string startNodeId;
        [SerializeReference, ReadOnly, Validation.Nested, Validation.Unique(nameof(VulcanusDialogueNode.Id)),
         JsonProperty(ItemConverterType = typeof(DialogueNodeJsonConverter))]
        private VulcanusDialogueNode[] nodes = Array.Empty<VulcanusDialogueNode>();
        [SerializeField, ReadOnly] private Message[] messages = Array.Empty<Message>();

        [NonSerialized] private Dictionary<string, int> _nodeIndexById;
        [NonSerialized] private Dictionary<string, string> _textByKey;

        public string DialogueId => id;
        public string StartNodeId => startNodeId;
        public IReadOnlyList<VulcanusDialogueNode> Nodes => nodes;

        public bool TryGetNode(string nodeId, out VulcanusDialogueNode node)
        {
            node = nodeId != null && NodeIndexById.TryGetValue(nodeId, out var index) ? nodes[index] : null;
            return node != null;
        }

        /// <summary>The next executable node in authored order, skipping comments.</summary>
        public bool TryGetExecutableNodeAfter(string nodeId, out VulcanusDialogueNode node)
        {
            var start = nodeId != null && NodeIndexById.TryGetValue(nodeId, out var index) ? index + 1 : 0;
            node = nodes.Skip(start).FirstOrDefault(candidate => candidate.IsExecutable);
            return node != null;
        }

        public string ResolveLocalizedText(string msgKey, string fallbackText)
        {
            _textByKey ??= messages.ToDictionary(message => message.MsgKey, message => message.Text);
            return !string.IsNullOrEmpty(msgKey) && _textByKey.TryGetValue(msgKey, out var text) && !string.IsNullOrEmpty(text)
                ? text : fallbackText ?? string.Empty;
        }

        private Dictionary<string, int> NodeIndexById =>
            _nodeIndexById ??= nodes.Select((node, index) => (node.Id, index)).ToDictionary(entry => entry.Id, entry => entry.index);
    }

    public sealed class VulcanusDialogueValidator : ScriptableObjectValidator<VulcanusDialogueAsset>
    {
        protected override void CollectConfigurationErrors(VulcanusDialogueAsset asset, List<ConfigurationError> errors) { }
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

    [Serializable]
    public abstract class VulcanusDialogueNode
    {
        [SerializeField] private string id;
        public string Id => id;
        public virtual bool IsExecutable => true;
    }

    [Serializable]
    public sealed class VulcanusDialogueLineNode : VulcanusDialogueNode
    {
        [Tooltip("Leave empty for neutral text such as signs, boards or narration, without a portrait or nameplate.")]
        [SerializeField] private string speaker;
        [SerializeField] private string emotion;
        [SerializeField] private string text;
        [SerializeField] private string msgKey;
        [SerializeField, Validation.OneOf(VulcanusDialogueAsset.NodesField, nameof(Id))] private string next;

        public string Speaker => speaker;
        public string Emotion => emotion;
        public string Text => text;
        public string MsgKey => msgKey;
        public string Next => next;
    }

    [Serializable]
    public sealed class VulcanusDialogueChoiceNode : VulcanusDialogueNode
    {
        [SerializeField, Validation.NotEmpty, Validation.Nested]
        private VulcanusDialogueChoiceOption[] options = Array.Empty<VulcanusDialogueChoiceOption>();
        public IReadOnlyList<VulcanusDialogueChoiceOption> Options => options;
    }

    [Serializable]
    public sealed class VulcanusDialogueActionNode : VulcanusDialogueNode
    {
        [SerializeField, Validation.LuaChunk] private string lua;
        [SerializeField, Validation.OneOf(VulcanusDialogueAsset.NodesField, nameof(Id))] private string next;

        public string Lua => lua;
        public string Next => next;
    }

    [Serializable]
    public sealed class VulcanusDialogueJumpNode : VulcanusDialogueNode
    {
        [Tooltip("Empty jumps within this dialogue.")]
        [SerializeField] private string targetDialogueId;
        [SerializeField, Validation.NotEmpty,
         Validation.OneOf(VulcanusDialogueAsset.NodesField, nameof(Id), UnlessSet = nameof(targetDialogueId))]
        private string targetNodeId;

        public string TargetDialogueId => targetDialogueId;
        public string TargetNodeId => targetNodeId;
    }

    [Serializable]
    public sealed class VulcanusDialogueCommentNode : VulcanusDialogueNode
    {
        [SerializeField] private string text;
        public string Text => text;
        public override bool IsExecutable => false;
    }

    [Serializable]
    public sealed class VulcanusDialogueEndNode : VulcanusDialogueNode { }

    [Serializable]
    public sealed class VulcanusDialogueChoiceOption
    {
        [SerializeField] private string id;
        [SerializeField] private string text;
        [SerializeField] private string msgKey;
        [SerializeField, Validation.LuaExpression] private string condition;
        [SerializeField, Validation.NotEmpty, Validation.OneOf(VulcanusDialogueAsset.NodesField, nameof(VulcanusDialogueNode.Id))]
        private string targetNodeId;

        public string Id => id;
        public string Text => text;
        public string MsgKey => msgKey;
        public string Condition => condition;
        public string TargetNodeId => targetNodeId;
    }
}

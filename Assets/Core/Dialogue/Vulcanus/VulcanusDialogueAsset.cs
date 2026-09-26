using System;
using System.Collections.Generic;
using System.Linq;
using Core.Tile.Vulcanus;
using UnityEngine;

namespace Core.Dialogue.Vulcanus
{
    [CreateAssetMenu(fileName = "VulcanusDialogue", menuName = "Game/Vulcanus/Dialogue")]
    public class VulcanusDialogueAsset : ScriptableObject
    {
        [Serializable]
        public class ImportedMessage
        {
            public string msgKey;
            public string text;
            public string nodeId;
            public string sourceType;
            public string optionId;
        }

        [SerializeField] private VulcanusProject project;
        [SerializeField] private int version;
        [SerializeField] private string dialogueId;
        [SerializeField] private string dialogueName;
        [SerializeField] private string folderPath;
        [SerializeField] private bool oneShot;
        [SerializeField] private string dialogueTypeId;
        [SerializeField] private string startNodeId;
        [SerializeField] private string[] tags = Array.Empty<string>();
        [SerializeField] private string createdAt;
        [SerializeField] private string updatedAt;
        [SerializeField] private ImportedMessage[] importedMessages = Array.Empty<ImportedMessage>();
        [SerializeField] private string[] importDiagnostics = Array.Empty<string>();
        [SerializeReference] private VulcanusDialogueNode[] nodes = Array.Empty<VulcanusDialogueNode>();

        private Dictionary<string, VulcanusDialogueNode> _nodeById;
        private Dictionary<string, int> _nodeIndexById;
        private Dictionary<string, ImportedMessage> _messageByKey;

        public VulcanusProject Project => project;
        public int Version => version;
        public string DialogueId => dialogueId;
        public string DialogueName => dialogueName;
        public string FolderPath => folderPath;
        public bool OneShot => oneShot;
        public string DialogueTypeId => dialogueTypeId;
        public string StartNodeId => startNodeId;
        public string[] Tags => tags;
        public string CreatedAt => createdAt;
        public string UpdatedAt => updatedAt;
        public ImportedMessage[] ImportedMessages => importedMessages;
        public string[] ImportDiagnostics => importDiagnostics;
        public IReadOnlyList<VulcanusDialogueNode> Nodes => nodes;

        public void Configure(
            VulcanusProject sourceProject,
            int fileVersion,
            string id,
            string name,
            string sourceFolderPath,
            bool isOneShot,
            string typeId,
            string entryNodeId,
            string[] dialogueTags,
            string created,
            string updated,
            VulcanusDialogueNode[] importedNodes,
            ImportedMessage[] messages,
            string[] diagnostics)
        {
            project = sourceProject;
            version = Mathf.Max(1, fileVersion);
            dialogueId = id ?? string.Empty;
            dialogueName = name ?? string.Empty;
            folderPath = sourceFolderPath ?? string.Empty;
            oneShot = isOneShot;
            dialogueTypeId = typeId ?? string.Empty;
            startNodeId = entryNodeId ?? string.Empty;
            tags = dialogueTags ?? Array.Empty<string>();
            createdAt = created ?? string.Empty;
            updatedAt = updated ?? string.Empty;
            nodes = importedNodes ?? Array.Empty<VulcanusDialogueNode>();
            importedMessages = messages ?? Array.Empty<ImportedMessage>();
            importDiagnostics = diagnostics ?? Array.Empty<string>();
            RebuildCaches();
        }

        public bool TryGetNode(string nodeId, out VulcanusDialogueNode node)
        {
            RebuildCachesIfNeeded();
            if (string.IsNullOrWhiteSpace(nodeId))
            {
                node = null;
                return false;
            }

            return _nodeById.TryGetValue(nodeId, out node);
        }

        public bool TryGetExecutableNodeAfter(string nodeId, out VulcanusDialogueNode node)
        {
            RebuildCachesIfNeeded();
            node = null;

            if (string.IsNullOrWhiteSpace(nodeId))
            {
                for (var i = 0; i < nodes.Length; i++)
                {
                    if (nodes[i] == null || !nodes[i].IsExecutable)
                        continue;

                    node = nodes[i];
                    return true;
                }

                return false;
            }

            if (!_nodeIndexById.TryGetValue(nodeId, out var startIndex))
                return false;

            for (var i = startIndex + 1; i < nodes.Length; i++)
            {
                if (nodes[i] == null || !nodes[i].IsExecutable)
                    continue;

                node = nodes[i];
                return true;
            }

            return false;
        }

        public string ResolveLocalizedText(string msgKey, string fallbackText)
        {
            RebuildCachesIfNeeded();
            if (!string.IsNullOrWhiteSpace(msgKey) &&
                _messageByKey.TryGetValue(msgKey, out var message) &&
                !string.IsNullOrEmpty(message.text))
                return message.text;

            return fallbackText ?? string.Empty;
        }

        public string ResolveEffectiveContextTypeId()
        {
            return project != null ? project.ResolveDialogueContextTypeId(dialogueTypeId) : string.Empty;
        }

        private void OnEnable()
        {
            RebuildCaches();
        }

        private void OnValidate()
        {
            RebuildCaches();
        }

        private void RebuildCachesIfNeeded()
        {
            if (_nodeById == null || _nodeIndexById == null || _messageByKey == null)
                RebuildCaches();
        }

        private void RebuildCaches()
        {
            _nodeById = new Dictionary<string, VulcanusDialogueNode>(StringComparer.OrdinalIgnoreCase);
            _nodeIndexById = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            _messageByKey = new Dictionary<string, ImportedMessage>(StringComparer.OrdinalIgnoreCase);

            if (nodes != null)
            {
                for (var i = 0; i < nodes.Length; i++)
                {
                    var node = nodes[i];
                    if (node == null || string.IsNullOrWhiteSpace(node.Id))
                        continue;

                    if (!_nodeById.ContainsKey(node.Id))
                        _nodeById.Add(node.Id, node);

                    if (!_nodeIndexById.ContainsKey(node.Id))
                        _nodeIndexById.Add(node.Id, i);
                }
            }

            if (importedMessages == null)
                return;

            foreach (var message in importedMessages.Where(m => m != null && !string.IsNullOrWhiteSpace(m.msgKey)))
            {
                if (!_messageByKey.ContainsKey(message.msgKey))
                    _messageByKey.Add(message.msgKey, message);
            }
        }
    }

    [Serializable]
    public abstract class VulcanusDialogueNode
    {
        [SerializeField] private string id;

        public string Id => id;
        public abstract VulcanusDialogueNodeType NodeType { get; }
        public virtual bool IsExecutable => true;

        protected VulcanusDialogueNode()
        {
        }

        protected VulcanusDialogueNode(string nodeId)
        {
            id = nodeId ?? string.Empty;
        }
    }

    public enum VulcanusDialogueNodeType
    {
        Line,
        Choice,
        Action,
        Jump,
        Comment,
        End
    }

    [Serializable]
    public sealed class VulcanusDialogueLineNode : VulcanusDialogueNode
    {
        [SerializeField] private string speaker;
        [SerializeField] private string emotion;
        [SerializeField] private string text;
        [SerializeField] private string msgKey;
        [SerializeField] private string next;

        public string Speaker => speaker;
        public string Emotion => emotion;
        public string Text => text;
        public string MsgKey => msgKey;
        public string Next => next;
        public override VulcanusDialogueNodeType NodeType => VulcanusDialogueNodeType.Line;

        public VulcanusDialogueLineNode()
        {
        }

        public VulcanusDialogueLineNode(string id, string speakerId, string emotionId, string rawText, string messageKey, string nextNodeId)
            : base(id)
        {
            speaker = speakerId ?? string.Empty;
            emotion = emotionId ?? string.Empty;
            text = rawText ?? string.Empty;
            msgKey = messageKey ?? string.Empty;
            next = nextNodeId;
        }
    }

    [Serializable]
    public sealed class VulcanusDialogueChoiceNode : VulcanusDialogueNode
    {
        [SerializeField] private VulcanusDialogueChoiceOption[] options = Array.Empty<VulcanusDialogueChoiceOption>();

        public VulcanusDialogueChoiceOption[] Options => options;
        public override VulcanusDialogueNodeType NodeType => VulcanusDialogueNodeType.Choice;

        public VulcanusDialogueChoiceNode()
        {
        }

        public VulcanusDialogueChoiceNode(string id, VulcanusDialogueChoiceOption[] choiceOptions)
            : base(id)
        {
            options = choiceOptions ?? Array.Empty<VulcanusDialogueChoiceOption>();
        }
    }

    [Serializable]
    public sealed class VulcanusDialogueActionNode : VulcanusDialogueNode
    {
        [SerializeField] private string lua;
        [SerializeField] private string next;

        public string Lua => lua;
        public string Next => next;
        public override VulcanusDialogueNodeType NodeType => VulcanusDialogueNodeType.Action;

        public VulcanusDialogueActionNode()
        {
        }

        public VulcanusDialogueActionNode(string id, string luaChunk, string nextNodeId)
            : base(id)
        {
            lua = luaChunk ?? string.Empty;
            next = nextNodeId;
        }
    }

    [Serializable]
    public sealed class VulcanusDialogueJumpNode : VulcanusDialogueNode
    {
        [SerializeField] private string targetDialogueId;
        [SerializeField] private string targetNodeId;

        public string TargetDialogueId => targetDialogueId;
        public string TargetNodeId => targetNodeId;
        public override VulcanusDialogueNodeType NodeType => VulcanusDialogueNodeType.Jump;

        public VulcanusDialogueJumpNode()
        {
        }

        public VulcanusDialogueJumpNode(string id, string destinationDialogueId, string destinationNodeId)
            : base(id)
        {
            targetDialogueId = destinationDialogueId;
            targetNodeId = destinationNodeId ?? string.Empty;
        }
    }

    [Serializable]
    public sealed class VulcanusDialogueCommentNode : VulcanusDialogueNode
    {
        [SerializeField] private string text;

        public string Text => text;
        public override VulcanusDialogueNodeType NodeType => VulcanusDialogueNodeType.Comment;
        public override bool IsExecutable => false;

        public VulcanusDialogueCommentNode()
        {
        }

        public VulcanusDialogueCommentNode(string id, string commentText)
            : base(id)
        {
            text = commentText ?? string.Empty;
        }
    }

    [Serializable]
    public sealed class VulcanusDialogueEndNode : VulcanusDialogueNode
    {
        public override VulcanusDialogueNodeType NodeType => VulcanusDialogueNodeType.End;

        public VulcanusDialogueEndNode()
        {
        }

        public VulcanusDialogueEndNode(string id)
            : base(id)
        {
        }
    }

    [Serializable]
    public sealed class VulcanusDialogueChoiceOption
    {
        [SerializeField] private string id;
        [SerializeField] private string text;
        [SerializeField] private string msgKey;
        [SerializeField] private string condition;
        [SerializeField] private string targetNodeId;

        public string Id => id;
        public string Text => text;
        public string MsgKey => msgKey;
        public string Condition => condition;
        public string TargetNodeId => targetNodeId;

        public VulcanusDialogueChoiceOption()
        {
        }

        public VulcanusDialogueChoiceOption(string optionId, string rawText, string messageKey, string conditionExpression, string destinationNodeId)
        {
            id = optionId ?? string.Empty;
            text = rawText ?? string.Empty;
            msgKey = messageKey ?? string.Empty;
            condition = string.IsNullOrWhiteSpace(conditionExpression) ? null : conditionExpression;
            targetNodeId = destinationNodeId ?? string.Empty;
        }
    }
}

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Core.Dialogue.Vulcanus;
using Core.Tile.Vulcanus;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class DialogueImporter
    {
        public static void ImportDialogue(AssetImportContext ctx)
        {
            var dto = VulcanusSchema.Read<DialogueDto>(ctx);
            var nodes = CreateNodes(dto, ctx.assetPath);

            var projectAssetPath = VulcanusImportHelpers.FindProjectAssetPath(ctx.assetPath);
            VulcanusProject project = null;
            if (!string.IsNullOrEmpty(projectAssetPath))
            {
                VulcanusImportHelpers.AddDependency(ctx, projectAssetPath);
                project = AssetDatabase.LoadAssetAtPath<VulcanusProject>(projectAssetPath);
            }

            var i18nPath = ResolveSiblingI18nAssetPath(ctx.assetPath);
            DialogueI18nDto i18nDto = null;
            if (!string.IsNullOrEmpty(i18nPath))
            {
                VulcanusImportHelpers.AddDependency(ctx, i18nPath);
                i18nDto = VulcanusImportHelpers.LoadDto<DialogueI18nDto>(i18nPath);
            }

            var asset = ScriptableObject.CreateInstance<VulcanusDialogueAsset>();
            asset.name = string.IsNullOrWhiteSpace(dto.Id) ? VulcanusImportHelpers.GetBaseName(ctx.assetPath) : dto.Id;

            var importedMessages = (i18nDto?.Messages ?? new List<DialogueI18nMessageDto>())
                .Where(message => message != null && !string.IsNullOrWhiteSpace(message.MsgKey))
                .Select(message => new VulcanusDialogueAsset.ImportedMessage(
                    message.MsgKey,
                    message.Text ?? string.Empty,
                    message.NodeId ?? string.Empty,
                    message.SourceType ?? string.Empty,
                    message.OptionId ?? string.Empty))
                .ToArray();

            asset.Configure(
                project,
                dto.Version,
                dto.Id,
                dto.Name,
                dto.FolderPath,
                dto.OneShot,
                dto.DialogueTypeId,
                dto.StartNodeId,
                dto.Tags?.ToArray() ?? Array.Empty<string>(),
                dto.CreatedAt,
                dto.UpdatedAt,
                nodes,
                importedMessages);

            ctx.AddObjectToAsset("dialogue", asset);
            ctx.SetMainObject(asset);
        }

        // Validate current sources before play/build: Unity can retain a previous artifact after a failed import.
        internal static void ValidateSources()
        {
            var sources = new Dictionary<string, VulcanusDialogueNode[]>(StringComparer.OrdinalIgnoreCase);
            foreach (var path in AssetDatabase.GetAllAssetPaths())
            {
                if (!path.StartsWith("Assets/", StringComparison.Ordinal) ||
                    !path.EndsWith(".runtime.dialogue.json", StringComparison.OrdinalIgnoreCase)) continue;
                var dto = VulcanusSchema.Read<DialogueDto>(path);
                sources.Add(dto.Id, CreateNodes(dto, path));
                if (!AssetDatabase.LoadAssetAtPath<VulcanusDialogueAsset>(path))
                    throw new InvalidOperationException($"{path}: requires a successful dialogue import before play/build.");
            }
            var catalog = Resources.Load<DialogueCatalog>(DialogueCatalog.ResourceName);
            foreach (var source in sources)
            {
                if (!catalog.Get(source.Key)) continue; // Disabled content cannot be started.
                foreach (var jump in source.Value.OfType<VulcanusDialogueJumpNode>())
                {
                    if (string.IsNullOrWhiteSpace(jump.TargetDialogueId)) continue;
                    if (!catalog.Get(jump.TargetDialogueId))
                        throw new InvalidOperationException($"Dialogue '{source.Key}', jump '{jump.Id}' requires enabled dialogue '{jump.TargetDialogueId}'.");
                    if (!sources.TryGetValue(jump.TargetDialogueId, out var target) ||
                        !target.Any(node => StringComparer.OrdinalIgnoreCase.Equals(node.Id, jump.TargetNodeId)))
                        throw new InvalidOperationException($"Dialogue '{source.Key}', jump '{jump.Id}' references missing node '{jump.TargetNodeId}' in '{jump.TargetDialogueId}'.");
                }
            }
        }

        internal static VulcanusDialogueNode[] CreateNodes(DialogueDto dto, string path)
        {
            var diagnostics = new List<string>();
            var nodeIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var nodes = new List<VulcanusDialogueNode>();
            if (string.IsNullOrWhiteSpace(dto.Id)) diagnostics.Add("Dialogue needs an id.");
            foreach (var nodeDto in dto.Nodes)
            {
                if (nodeDto == null || string.IsNullOrWhiteSpace(nodeDto.Id))
                {
                    diagnostics.Add("Encountered a node without an id.");
                    continue;
                }
                if (!nodeIds.Add(nodeDto.Id)) diagnostics.Add($"Duplicate node id '{nodeDto.Id}'.");
                var node = CreateNode(nodeDto, diagnostics);
                if (node != null) nodes.Add(node);
            }
            ValidateGraph(dto, nodeIds, diagnostics);
            if (diagnostics.Count > 0)
                throw new FormatException($"{path}: invalid dialogue '{dto.Id}':\n{string.Join("\n", diagnostics)}");
            return nodes.ToArray();
        }

        private static VulcanusDialogueNode CreateNode(DialogueNodeDto nodeDto, ICollection<string> diagnostics)
        {
            switch (nodeDto.Type?.Trim().ToLowerInvariant())
            {
                case "line":
                    return new VulcanusDialogueLineNode(
                        nodeDto.Id,
                        nodeDto.Speaker,
                        nodeDto.Emotion,
                        nodeDto.Text,
                        nodeDto.MsgKey,
                        NormalizeOptionalLink(nodeDto.Next));

                case "choice":
                    return new VulcanusDialogueChoiceNode(
                        nodeDto.Id,
                        (nodeDto.Options ?? new List<DialogueChoiceOptionDto>())
                        .Where(option => option != null)
                        .Select(option => new VulcanusDialogueChoiceOption(
                            option.Id,
                            option.Text,
                            option.MsgKey,
                            option.Condition,
                            option.TargetNodeId))
                        .ToArray());

                case "action":
                    return new VulcanusDialogueActionNode(
                        nodeDto.Id,
                        nodeDto.Lua,
                        NormalizeOptionalLink(nodeDto.Next));

                case "jump":
                    return new VulcanusDialogueJumpNode(
                        nodeDto.Id,
                        NormalizeOptionalLink(nodeDto.TargetDialogueId),
                        nodeDto.TargetNodeId);

                case "comment":
                    return new VulcanusDialogueCommentNode(nodeDto.Id, nodeDto.Text);

                case "end":
                    return new VulcanusDialogueEndNode(nodeDto.Id);

                default:
                    diagnostics.Add($"Unsupported dialogue node type '{nodeDto.Type}' on node '{nodeDto.Id}'.");
                    return null;
            }
        }

        private static void ValidateGraph(DialogueDto dialogue, ISet<string> nodeIds, ICollection<string> diagnostics)
        {
            if (dialogue == null)
            {
                diagnostics.Add("Dialogue DTO was null.");
                return;
            }

            if (string.IsNullOrWhiteSpace(dialogue.StartNodeId))
            {
                diagnostics.Add($"Dialogue '{dialogue.Id}' has an empty startNodeId.");
            }
            else if (!nodeIds.Contains(dialogue.StartNodeId))
            {
                diagnostics.Add($"Dialogue '{dialogue.Id}' startNodeId '{dialogue.StartNodeId}' does not exist.");
            }

            foreach (var node in dialogue.Nodes ?? Enumerable.Empty<DialogueNodeDto>())
            {
                if (node == null)
                    continue;

                if ((string.Equals(node.Type, "line", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(node.Type, "action", StringComparison.OrdinalIgnoreCase)) &&
                    !string.IsNullOrWhiteSpace(node.Next) &&
                    !nodeIds.Contains(node.Next))
                {
                    diagnostics.Add($"Node '{node.Id}' references missing next node '{node.Next}'.");
                }

                if (string.Equals(node.Type, "choice", StringComparison.OrdinalIgnoreCase))
                {
                    if (node.Options == null || node.Options.Count == 0)
                        diagnostics.Add($"Choice '{node.Id}' needs at least one option.");
                    foreach (var option in node.Options ?? Enumerable.Empty<DialogueChoiceOptionDto>())
                    {
                        if (option == null)
                        {
                            diagnostics.Add($"Choice '{node.Id}' contains a null option.");
                            continue;
                        }

                        if (string.IsNullOrWhiteSpace(option.TargetNodeId))
                        {
                            diagnostics.Add($"Choice option '{option.Id}' on node '{node.Id}' has an empty targetNodeId.");
                            continue;
                        }

                        if (!nodeIds.Contains(option.TargetNodeId))
                            diagnostics.Add($"Choice option '{option.Id}' on node '{node.Id}' references missing node '{option.TargetNodeId}'.");
                    }
                }

                if (string.Equals(node.Type, "jump", StringComparison.OrdinalIgnoreCase) &&
                    string.IsNullOrWhiteSpace(node.TargetNodeId))
                    diagnostics.Add($"Jump node '{node.Id}' has an empty targetNodeId.");

                if (string.Equals(node.Type, "jump", StringComparison.OrdinalIgnoreCase) &&
                    string.IsNullOrWhiteSpace(node.TargetDialogueId) &&
                    !string.IsNullOrWhiteSpace(node.TargetNodeId) &&
                    !nodeIds.Contains(node.TargetNodeId))
                {
                    diagnostics.Add($"Jump node '{node.Id}' references missing local node '{node.TargetNodeId}'.");
                }
            }
        }

        private static string NormalizeOptionalLink(string value)
        {
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }

        private static string ResolveSiblingI18nAssetPath(string runtimeDialogueAssetPath)
        {
            var absolutePath = VulcanusImportHelpers.ToAbsolutePath(runtimeDialogueAssetPath);
            var fileName = Path.GetFileName(absolutePath);
            if (string.IsNullOrWhiteSpace(fileName) ||
                !fileName.EndsWith(".runtime.dialogue.json", StringComparison.OrdinalIgnoreCase))
                return null;

            var i18nFileName = fileName[..^".runtime.dialogue.json".Length] + ".i18n.json";
            var siblingAbsolutePath = Path.Combine(Path.GetDirectoryName(absolutePath) ?? string.Empty, i18nFileName);
            if (!File.Exists(siblingAbsolutePath))
                return null;

            return VulcanusImportHelpers.TryAbsoluteToAssetPath(siblingAbsolutePath, out var assetPath) ? assetPath : null;
        }
    }
}

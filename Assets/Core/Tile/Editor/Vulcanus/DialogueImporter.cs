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
            var dto = VulcanusImportHelpers.LoadDto<DialogueDto>(ctx.assetPath);
            var diagnostics = new List<string>();

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

            var nodeIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var nodes = new List<VulcanusDialogueNode>();
            foreach (var nodeDto in dto.Nodes ?? Enumerable.Empty<DialogueNodeDto>())
            {
                if (nodeDto == null)
                    continue;

                if (string.IsNullOrWhiteSpace(nodeDto.Id))
                {
                    diagnostics.Add("Encountered a node without an id.");
                    continue;
                }

                if (!nodeIds.Add(nodeDto.Id))
                {
                    diagnostics.Add($"Duplicate node id '{nodeDto.Id}'.");
                    continue;
                }

                var importedNode = CreateNode(nodeDto, diagnostics);
                if (importedNode != null)
                    nodes.Add(importedNode);
            }

            ValidateGraph(dto, nodeIds, diagnostics);

            var importedMessages = (i18nDto?.Messages ?? new List<DialogueI18nMessageDto>())
                .Where(message => message != null && !string.IsNullOrWhiteSpace(message.MsgKey))
                .Select(message => new VulcanusDialogueAsset.ImportedMessage
                {
                    msgKey = message.MsgKey,
                    text = message.Text ?? string.Empty,
                    nodeId = message.NodeId ?? string.Empty,
                    sourceType = message.SourceType ?? string.Empty,
                    optionId = message.OptionId ?? string.Empty
                })
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
                nodes.ToArray(),
                importedMessages,
                diagnostics.ToArray());

            ctx.AddObjectToAsset("dialogue", asset);
            ctx.SetMainObject(asset);
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
                    foreach (var option in node.Options ?? Enumerable.Empty<DialogueChoiceOptionDto>())
                    {
                        if (option == null)
                            continue;

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

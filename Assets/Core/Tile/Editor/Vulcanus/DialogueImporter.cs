using System;
using System.IO;
using System.Linq;
using Core.Dialogue.Vulcanus;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>Imports *.runtime.dialogue.json, with the texts of its sibling .i18n.json, into a <see cref="VulcanusDialogueAsset"/>.</summary>
    internal static class DialogueImporter
    {
        private const string Extension = ".runtime.dialogue.json";

        public static void ImportDialogue(AssetImportContext ctx)
        {
            var dialogue = VulcanusJson.Import<VulcanusDialogueAsset>(ctx, "dialogue", definition => definition.Id);
            var i18nPath = ctx.assetPath[..^Extension.Length] + ".i18n.json";
            if (!File.Exists(i18nPath)) return;
            VulcanusImportHelpers.AddDependency(ctx, i18nPath);
            VulcanusJson.Fill(dialogue, VulcanusSchema.ReadChecked(i18nPath, "dialogue-i18n"));
        }

        /// <summary>Before play/build: every dialogue imported, and jumps into other dialogues reach enabled ones.</summary>
        internal static void ValidateSources()
        {
            foreach (var path in AssetDatabase.GetAllAssetPaths())
                if (path.StartsWith("Assets/", StringComparison.Ordinal) && path.EndsWith(Extension, StringComparison.OrdinalIgnoreCase) &&
                    !AssetDatabase.LoadAssetAtPath<VulcanusDialogueAsset>(path))
                    throw new InvalidOperationException($"{path}: requires a successful dialogue import before play/build.");
            var catalog = Resources.Load<DialogueCatalog>(DialogueCatalog.ResourceName);
            foreach (var dialogue in catalog.EnabledDefinitions)
            foreach (var jump in dialogue.Nodes.OfType<VulcanusDialogueJumpNode>().Where(jump => !string.IsNullOrEmpty(jump.TargetDialogueId)))
            {
                var target = catalog.Get(jump.TargetDialogueId)
                    ?? throw new InvalidOperationException($"Dialogue '{dialogue.Id}', jump '{jump.Id}' requires enabled dialogue '{jump.TargetDialogueId}'.");
                if (!target.TryGetNode(jump.TargetNodeId, out _))
                    throw new InvalidOperationException($"Dialogue '{dialogue.Id}', jump '{jump.Id}' references missing node '{jump.TargetNodeId}' in '{jump.TargetDialogueId}'.");
            }
        }
    }
}

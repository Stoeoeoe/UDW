using System;
using System.Linq;
using UnityEditor;

namespace Core.Dialogue.Vulcanus.Editor
{
    /// <summary>Keeps assigned project databases in sync with imported dialogue assets.</summary>
    internal static class DialogueDatabaseDiscovery
    {
        internal static void RefreshAll()
        {
            foreach (var guid in AssetDatabase.FindAssets("t:VulcanusDialogueDatabase"))
                Refresh(AssetDatabase.LoadAssetAtPath<VulcanusDialogueDatabase>(AssetDatabase.GUIDToAssetPath(guid)));
        }

        internal static void Refresh(VulcanusDialogueDatabase database)
        {
            if (!database.Project)
                throw new InvalidOperationException($"Dialogue database '{database.name}' requires its source project.");
            var dialogues = AssetDatabase.FindAssets("t:VulcanusDialogueAsset")
                .Select(AssetDatabase.GUIDToAssetPath).OrderBy(path => path, StringComparer.Ordinal)
                .Select(AssetDatabase.LoadAssetAtPath<VulcanusDialogueAsset>)
                .Where(dialogue => dialogue && dialogue.Project == database.Project).ToArray();
            foreach (var dialogue in dialogues)
                if (string.IsNullOrWhiteSpace(dialogue.DialogueId))
                    throw new InvalidOperationException($"Dialogue '{AssetDatabase.GetAssetPath(dialogue)}' requires an ID.");
            var duplicate = dialogues.GroupBy(dialogue => dialogue.DialogueId, StringComparer.OrdinalIgnoreCase)
                .FirstOrDefault(group => group.Count() > 1);
            if (duplicate != null)
                throw new InvalidOperationException($"Dialogue database '{database.name}' has duplicate dialogue ID '{duplicate.Key}'.");

            var changed = !database.Dialogues.SequenceEqual(dialogues);
            // Reconfigure even when membership is unchanged: reimport can change an asset's ID.
            database.Configure(database.Project, dialogues);
            if (!changed) return;
            EditorUtility.SetDirty(database);
            AssetDatabase.SaveAssetIfDirty(database);
        }
    }
}

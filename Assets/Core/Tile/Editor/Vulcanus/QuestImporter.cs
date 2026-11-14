using System.IO;
using Core.Quests;
using UnityEditor.AssetImporters;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>Imports *.quest.json, with the texts of its sibling <c>.i18n.json</c>, into a <see cref="QuestDefinition"/>.</summary>
    internal static class QuestImporter
    {
        public static void ImportQuest(AssetImportContext ctx)
        {
            var quest = VulcanusJson.Import<QuestDefinition>(ctx, "quest", definition => definition.QuestId);
            var i18nPath = ctx.assetPath[..^".quest.json".Length] + ".i18n.json";
            if (!File.Exists(i18nPath)) return;
            VulcanusImportHelpers.AddDependency(ctx, i18nPath);
            VulcanusJson.Fill(quest, VulcanusSchema.ReadChecked(i18nPath));
        }
    }
}

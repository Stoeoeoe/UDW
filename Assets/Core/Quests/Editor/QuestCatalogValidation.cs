using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Catalogs.Editor;
using Core.Dialogue.Vulcanus;
using Core.Inventory;
using Core.Tile.Vulcanus;

namespace Core.Quests.Editor
{
    /// <summary>
    /// Quests reference characters, dialogues, items, maps and triggers authored elsewhere, which can change without
    /// reimporting the quest. Catalog refresh checks them where they meet.
    /// </summary>
    internal static class QuestCatalogValidation
    {
        /// <summary>The content a quest may refer to.</summary>
        internal sealed class KnownContent
        {
            public readonly HashSet<string> Characters = new(StringComparer.Ordinal);
            public readonly HashSet<string> Dialogues = new(StringComparer.OrdinalIgnoreCase);
            public readonly HashSet<string> Items = new(StringComparer.Ordinal);
            /// <summary>Trigger IDs by map ID.</summary>
            public readonly Dictionary<string, HashSet<string>> TriggersByMap = new(StringComparer.OrdinalIgnoreCase);
        }

        public static void Validate(IEnumerable<QuestDefinition> quests)
        {
            var known = FindKnownContent();
            var problem = quests.SelectMany(quest => Problems(quest, known)).FirstOrDefault();
            if (problem != null) throw new InvalidOperationException(problem);
        }

        internal static IEnumerable<string> Problems(QuestDefinition quest, KnownContent known)
        {
            string Prefix(string where) => $"Quest '{quest.QuestId}': {where}";
            if (!string.IsNullOrEmpty(quest.GiverId) && !known.Characters.Contains(quest.GiverId))
                yield return Prefix($"the giver '{quest.GiverId}' is not a known character.");
            foreach (var step in quest.Steps)
                foreach (var objective in step.Objectives)
                {
                    var where = $"objective '{objective.Id}' of step '{step.Id}'";
                    if (!string.IsNullOrEmpty(objective.CharacterId) && !known.Characters.Contains(objective.CharacterId))
                        yield return Prefix($"{where} talks to the unknown character '{objective.CharacterId}'.");
                    if (!string.IsNullOrEmpty(objective.DialogueId) && !known.Dialogues.Contains(objective.DialogueId))
                        yield return Prefix($"{where} uses the unknown dialogue '{objective.DialogueId}'.");
                    if (!string.IsNullOrEmpty(objective.ItemId) && !known.Items.Contains(objective.ItemId))
                        yield return Prefix($"{where} needs the unknown item '{objective.ItemId}'.");
                    if (string.IsNullOrEmpty(objective.MapId)) continue;
                    if (!known.TriggersByMap.TryGetValue(objective.MapId, out var triggers))
                        yield return Prefix($"{where} goes to the unknown map '{objective.MapId}'.");
                    else if (!string.IsNullOrEmpty(objective.TriggerId) && !triggers.Contains(objective.TriggerId))
                        yield return Prefix($"{where} uses the unknown trigger '{objective.TriggerId}' on map '{objective.MapId}'.");
                }
        }

        private static KnownContent FindKnownContent()
        {
            var known = new KnownContent();
            foreach (var character in CatalogAssetDiscovery.Find("Assets", typeof(CharacterDefinition)).Cast<CharacterDefinition>())
                known.Characters.Add(character.CharacterId);
            foreach (var dialogue in CatalogAssetDiscovery.Find("Assets", typeof(VulcanusDialogueAsset)).Cast<VulcanusDialogueAsset>())
                known.Dialogues.Add(dialogue.DialogueId);
            foreach (var item in CatalogAssetDiscovery.Find("Assets", typeof(ItemDefinition)).Cast<ItemDefinition>())
                known.Items.Add(item.ItemId);
            foreach (var world in CatalogAssetDiscovery.Find("Assets", typeof(VulcanusWorldCatalog)).Cast<VulcanusWorldCatalog>())
                foreach (var binding in world.MapBindings)
                    if (binding.MapPrefab)
                        known.TriggersByMap[binding.MapId] = binding.MapPrefab.GetComponentsInChildren<VulcanusMapTrigger>(true)
                            .Select(trigger => trigger.TriggerId).ToHashSet(StringComparer.Ordinal);
            return known;
        }
    }
}

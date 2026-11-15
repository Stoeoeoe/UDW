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
            string Prefix(string where) => $"Quest '{quest.Id}': {where}";
            if (!string.IsNullOrEmpty(quest.Giver) && !known.Characters.Contains(quest.Giver))
                yield return Prefix($"the giver '{quest.Giver}' is not a known character.");
            foreach (var step in quest.Steps)
                foreach (var objective in step.Objectives)
                {
                    var where = $"objective '{objective.Id}' of step '{step.Id}'";
                    if (!string.IsNullOrEmpty(objective.Character) && !known.Characters.Contains(objective.Character))
                        yield return Prefix($"{where} talks to the unknown character '{objective.Character}'.");
                    if (!string.IsNullOrEmpty(objective.Dialogue) && !known.Dialogues.Contains(objective.Dialogue))
                        yield return Prefix($"{where} uses the unknown dialogue '{objective.Dialogue}'.");
                    if (!string.IsNullOrEmpty(objective.Item) && !known.Items.Contains(objective.Item))
                        yield return Prefix($"{where} needs the unknown item '{objective.Item}'.");
                    if (string.IsNullOrEmpty(objective.Map)) continue;
                    if (!known.TriggersByMap.TryGetValue(objective.Map, out var triggers))
                        yield return Prefix($"{where} goes to the unknown map '{objective.Map}'.");
                    else if (!string.IsNullOrEmpty(objective.Trigger) && !triggers.Contains(objective.Trigger))
                        yield return Prefix($"{where} uses the unknown trigger '{objective.Trigger}' on map '{objective.Map}'.");
                }
        }

        private static KnownContent FindKnownContent()
        {
            var known = new KnownContent();
            foreach (var character in CatalogAssetDiscovery.Find("Assets", typeof(CharacterDefinition)).Cast<CharacterDefinition>())
                known.Characters.Add(character.Id);
            foreach (var dialogue in CatalogAssetDiscovery.Find("Assets", typeof(VulcanusDialogueAsset)).Cast<VulcanusDialogueAsset>())
                known.Dialogues.Add(dialogue.Id);
            foreach (var item in CatalogAssetDiscovery.Find("Assets", typeof(ItemDefinition)).Cast<ItemDefinition>())
                known.Items.Add(item.Id);
            foreach (var world in CatalogAssetDiscovery.Find("Assets", typeof(VulcanusWorldCatalog)).Cast<VulcanusWorldCatalog>())
                foreach (var binding in world.MapBindings)
                    if (binding.MapPrefab)
                        known.TriggersByMap[binding.MapId] = binding.MapPrefab.GetComponentsInChildren<VulcanusMapTrigger>(true)
                            .Select(trigger => trigger.TriggerId).ToHashSet(StringComparer.Ordinal);
            return known;
        }
    }
}

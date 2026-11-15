using System;
using System.Collections.Generic;
using System.Linq;
using Core.Catalogs.Editor;
using Core.Tile.Vulcanus;

namespace Core.Quests.Editor
{
    /// <summary>
    /// Quests reference maps and triggers authored elsewhere, which can change without reimporting the quest. Catalog
    /// refresh checks them where they meet; references to other definitions are <c>Validation.Reference</c> rules.
    /// </summary>
    internal static class QuestCatalogValidation
    {
        /// <summary>The map content a quest may refer to.</summary>
        internal sealed class KnownContent
        {
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
            foreach (var when in quest.Start.When)
                if (!string.IsNullOrEmpty(when.Map) && !known.TriggersByMap.ContainsKey(when.Map))
                    yield return Prefix($"it starts on entering the unknown map '{when.Map}'.");
            foreach (var step in quest.Steps)
                foreach (var objective in step.Objectives)
                {
                    var where = $"objective '{objective.Id}' of step '{step.Id}'";
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
            foreach (var world in CatalogAssetDiscovery.Find("Assets", typeof(VulcanusWorldCatalog)).Cast<VulcanusWorldCatalog>())
                foreach (var binding in world.MapBindings)
                    if (binding.MapPrefab)
                        known.TriggersByMap[binding.MapId] = binding.MapPrefab.GetComponentsInChildren<VulcanusMapTrigger>(true)
                            .Select(trigger => trigger.TriggerId).ToHashSet(StringComparer.Ordinal);
            return known;
        }
    }
}

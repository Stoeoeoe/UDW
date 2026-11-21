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
        [Core.Catalogs.Editor.DefinitionValidation(typeof(QuestDefinition))]
        public static void Validate(IEnumerable<QuestDefinition> quests)
        {
            var triggersByMap = FindTriggersByMap();
            var problem = quests.SelectMany(quest => Problems(quest, triggersByMap)).FirstOrDefault();
            if (problem != null) throw new InvalidOperationException(problem);
        }

        /// <param name="triggersByMap">The trigger IDs of each known map.</param>
        internal static IEnumerable<string> Problems(QuestDefinition quest, IReadOnlyDictionary<string, HashSet<string>> triggersByMap)
        {
            string Prefix(string where) => $"Quest '{quest.Id}': {where}";
            foreach (var when in quest.Start.When)
                if (!string.IsNullOrEmpty(when.Map) && !triggersByMap.ContainsKey(when.Map))
                    yield return Prefix($"it starts on entering the unknown map '{when.Map}'.");
            foreach (var step in quest.Steps)
                foreach (var objective in step.Objectives)
                {
                    var where = $"objective '{objective.Id}' of step '{step.Id}'";
                    if (string.IsNullOrEmpty(objective.Map)) continue;
                    if (!triggersByMap.TryGetValue(objective.Map, out var triggers))
                        yield return Prefix($"{where} goes to the unknown map '{objective.Map}'.");
                    else if (!string.IsNullOrEmpty(objective.Trigger) && !triggers.Contains(objective.Trigger))
                        yield return Prefix($"{where} uses the unknown trigger '{objective.Trigger}' on map '{objective.Map}'.");
                }
        }

        private static Dictionary<string, HashSet<string>> FindTriggersByMap()
        {
            var triggersByMap = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
            foreach (var world in CatalogAssetDiscovery.Find("Assets", typeof(VulcanusWorldCatalog)).Cast<VulcanusWorldCatalog>())
                foreach (var binding in world.MapBindings)
                    if (binding.MapPrefab)
                        triggersByMap[binding.MapId] = binding.MapPrefab.GetComponentsInChildren<VulcanusMapTrigger>(true)
                            .Select(trigger => trigger.TriggerId).ToHashSet(StringComparer.Ordinal);
            return triggersByMap;
        }
    }
}

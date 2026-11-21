using Core.Routines;
using Core.Catalogs;
using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Catalogs.Editor;
using Core.Spawning;
using Interaction.Dialogue;
using Core.Tile.Vulcanus;

namespace Core.Routines.Editor
{
    /// <summary>
    /// Routines reference map anchors and map placements authored elsewhere, which can change without reimporting the
    /// routine. Catalog refresh checks them where they meet; references to other definitions are <c>Validation.Reference</c> rules.
    /// </summary>
    internal static class RoutineCatalogValidation
    {
        [Core.Catalogs.Editor.DefinitionValidation(typeof(RoutineDefinition))]
        public static void Validate(IReadOnlyCollection<RoutineDefinition> routines)
        {
            // The routine decides what its character says, so the character's prefab must not fix a dialogue of its own.
            var fixedDialogues = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var prefab in CatalogAssetDiscovery.Find(DefinitionCatalog.DiscoveryPath(typeof(SpawnedObject)), typeof(SpawnedObject)).Cast<SpawnedObject>())
            {
                var character = prefab.GetComponentInChildren<GameCharacter>(true);
                var talk = prefab.GetComponentInChildren<ShowVulcanusDialogueInteractable>(true);
                if (character && character.Definition && talk && !string.IsNullOrWhiteSpace(talk.DialogueId))
                    fixedDialogues.TryAdd(character.CharacterId, prefab.name);
            }

            var anchorsByMap = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
            var placedCharacters = new Dictionary<string, string>(StringComparer.Ordinal);
            var worlds = CatalogAssetDiscovery.Find("Assets", typeof(VulcanusWorldCatalog)).Cast<VulcanusWorldCatalog>().ToArray();
            var links = MapLinkGraph.Build(worlds);
            foreach (var world in worlds)
                foreach (var binding in world.MapBindings)
                    if (binding.MapPrefab)
                    {
                        anchorsByMap[binding.MapId] = binding.MapPrefab.GetComponentsInChildren<VulcanusMapAnchor>(true)
                            .Select(anchor => anchor.AnchorId).ToHashSet(StringComparer.Ordinal);
                        foreach (var placed in binding.MapPrefab.GetComponentsInChildren<GameCharacter>(true))
                            placedCharacters.TryAdd(placed.CharacterId, binding.MapId);
                    }

            void RequirePlace(RoutineDefinition routine, RoutinePlace place, string role)
            {
                if (!anchorsByMap.TryGetValue(place.Map, out var anchors))
                    throw new InvalidOperationException($"Routine '{routine.Id}': {role} uses the unknown map '{place.Map}'.");
                if (!anchors.Contains(place.Anchor))
                    throw new InvalidOperationException($"Routine '{routine.Id}': {role} uses the unknown anchor '{place.Anchor}' on map '{place.Map}'.");
            }

            foreach (var duplicate in routines.GroupBy(routine => routine.Character).Where(group => group.Count() > 1))
                throw new InvalidOperationException($"Character '{duplicate.Key}' has more than one routine.");
            foreach (var routine in routines)
            {
                // The routine decides where its character is; a map placement would add a second copy.
                if (placedCharacters.TryGetValue(routine.Character, out var placedMap))
                    throw new InvalidOperationException($"Character '{routine.Character}' has the routine '{routine.Id}' and is also " +
                        $"placed on map '{placedMap}'. Remove the map placement; the routine places the character.");
                if (fixedDialogues.TryGetValue(routine.Character, out var fixedPrefab))
                    throw new InvalidOperationException($"Character '{routine.Character}' has the routine '{routine.Id}', " +
                        $"but its prefab '{fixedPrefab}' fixes a dialogue. Clear it; the routine sets what the character says.");
                RequirePlace(routine, routine.Home, "home");
                var goalLists = routine.Overrides.Concat(routine.Variants)
                    .SelectMany(entry => entry.IsPool ? entry.PickOne.Select(choice => choice.Goals) : new[] { entry.Goals });
                foreach (var goal in goalLists.SelectMany(goals => goals))
                {
                    if (!goal.ToHome) RequirePlace(routine, goal.Destination, $"goal '{goal.Id}'");
                }
                var unreachable = UnreachableGoals(routine, links).FirstOrDefault();
                if (unreachable != null) throw new InvalidOperationException(unreachable);
            }
        }

        /// <summary>
        /// Goals whose map no chain of location links reaches from where the character comes from: home, or the goal
        /// before. Skipped goals need no extra check, since reaching through a goal's map also reaches past it.
        /// </summary>
        internal static IEnumerable<string> UnreachableGoals(RoutineDefinition routine, MapLinkGraph links)
        {
            var days = routine.Overrides.Concat(routine.Variants)
                .SelectMany(entry => entry.IsPool ? entry.PickOne.Cast<RoutineDay>() : new RoutineDay[] { entry });
            foreach (var day in days)
            {
                var from = routine.Home;
                foreach (var goal in day.Goals)
                {
                    var to = goal.ToHome ? routine.Home : goal.Destination;
                    if (!links.CanReach(from.Map, to.Map))
                        yield return $"Routine '{routine.Id}': goal '{goal.Id}' of '{day.Id}' goes to map '{to.Map}', " +
                            $"but no location links lead there from map '{from.Map}'.";
                    from = to;
                }
            }
        }
    }
}

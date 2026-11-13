using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Character.Animations;
using Core.Catalogs.Editor;
using Core.Dialogue.Vulcanus;
using Core.Spawning;
using Interaction.Dialogue;
using Core.Tile.Vulcanus;

namespace Core.Routines.Editor
{
    /// <summary>
    /// Routines reference characters, animations, map anchors and map placements authored elsewhere, which can change
    /// without reimporting the routine. Catalog refresh checks them where they meet.
    /// </summary>
    internal static class RoutineCatalogValidation
    {
        public static void Validate(IReadOnlyCollection<RoutineDefinition> routines)
        {
            var characterIds = CatalogAssetDiscovery.Find("Assets", typeof(CharacterDefinition)).Cast<CharacterDefinition>()
                .Select(character => character.CharacterId).ToHashSet();
            var animationIds = CatalogAssetDiscovery.Find("Assets", typeof(CharacterAnimationDefinition)).Cast<CharacterAnimationDefinition>()
                .Select(animation => animation.Id).ToHashSet();
            var dialogueIds = CatalogAssetDiscovery.Find("Assets", typeof(VulcanusDialogueAsset)).Cast<VulcanusDialogueAsset>()
                .Select(dialogue => dialogue.DialogueId).ToHashSet(StringComparer.OrdinalIgnoreCase);
            // The routine decides what its character says, so the character's prefab must not fix a dialogue of its own.
            var fixedDialogues = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var prefab in CatalogAssetDiscovery.Find(SpawnableCatalog.PrefabFolder, typeof(SpawnedObject)).Cast<SpawnedObject>())
            {
                var character = prefab.GetComponentInChildren<GameCharacter>(true);
                var talk = prefab.GetComponentInChildren<ShowVulcanusDialogueInteractable>(true);
                if (character && character.Definition && talk && !string.IsNullOrWhiteSpace(talk.DialogueId))
                    fixedDialogues.TryAdd(character.CharacterId, prefab.name);
            }

            void RequireDialogue(RoutineDefinition routine, string dialogueId, string role)
            {
                if (!string.IsNullOrEmpty(dialogueId) && !dialogueIds.Contains(dialogueId))
                    throw new InvalidOperationException($"Routine '{routine.RoutineId}': {role} uses the unknown dialogue '{dialogueId}'.");
            }
            var anchorsByMap = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
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
                if (!anchorsByMap.TryGetValue(place.MapId, out var anchors))
                    throw new InvalidOperationException($"Routine '{routine.RoutineId}': {role} uses the unknown map '{place.MapId}'.");
                if (!anchors.Contains(place.AnchorId))
                    throw new InvalidOperationException($"Routine '{routine.RoutineId}': {role} uses the unknown anchor '{place.AnchorId}' on map '{place.MapId}'.");
            }

            foreach (var duplicate in routines.GroupBy(routine => routine.CharacterId).Where(group => group.Count() > 1))
                throw new InvalidOperationException($"Character '{duplicate.Key}' has more than one routine.");
            foreach (var routine in routines)
            {
                if (!characterIds.Contains(routine.CharacterId))
                    throw new InvalidOperationException($"Routine '{routine.RoutineId}' is for the unknown character '{routine.CharacterId}'.");
                // The routine decides where its character is; a map placement would add a second copy.
                if (placedCharacters.TryGetValue(routine.CharacterId, out var placedMap))
                    throw new InvalidOperationException($"Character '{routine.CharacterId}' has the routine '{routine.RoutineId}' and is also " +
                        $"placed on map '{placedMap}'. Remove the map placement; the routine places the character.");
                if (fixedDialogues.TryGetValue(routine.CharacterId, out var fixedPrefab))
                    throw new InvalidOperationException($"Character '{routine.CharacterId}' has the routine '{routine.RoutineId}', " +
                        $"but its prefab '{fixedPrefab}' fixes a dialogue. Clear it; the routine sets what the character says.");
                RequirePlace(routine, routine.Home, "home");
                RequireDialogue(routine, routine.DialogueId, "the start of the day");
                var goalLists = routine.Overrides.Concat(routine.Variants)
                    .SelectMany(entry => entry.IsPool ? entry.PickOne.Select(choice => choice.Goals) : new[] { entry.Goals });
                foreach (var goal in goalLists.SelectMany(goals => goals))
                {
                    if (!goal.ToHome) RequirePlace(routine, goal.Destination, $"goal '{goal.Id}'");
                    RequireDialogue(routine, goal.WalkingDialogueId, $"goal '{goal.Id}' (walking)");
                    RequireDialogue(routine, goal.DialogueId, $"goal '{goal.Id}'");
                    if (!string.IsNullOrEmpty(goal.ActivityAnimationId) && !animationIds.Contains(goal.ActivityAnimationId))
                        throw new InvalidOperationException($"Routine '{routine.RoutineId}': goal '{goal.Id}' uses the unknown animation '{goal.ActivityAnimationId}'.");
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
                    if (!links.CanReach(from.MapId, to.MapId))
                        yield return $"Routine '{routine.RoutineId}': goal '{goal.Id}' of '{day.Id}' goes to map '{to.MapId}', " +
                            $"but no location links lead there from map '{from.MapId}'.";
                    from = to;
                }
            }
        }
    }
}

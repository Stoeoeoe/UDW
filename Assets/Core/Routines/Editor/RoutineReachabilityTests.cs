using System.Linq;
using Core.Common.Editor;
using Core.Tile.Vulcanus;
using NUnit.Framework;
using UnityEditor;

namespace Core.Routines.Editor
{
    public sealed class RoutineReachabilityTests : GameTest
    {
        // map-1 <-> town, town -> cellar; nothing leads back out of the cellar or to the island.
        private static readonly MapLinkGraph Links = new(new[]
        {
            new MapLink("base:map-1", "base:town", "gate"),
            new MapLink("base:town", "base:map-1", "gate"),
            new MapLink("base:town", "base:cellar", "stairs")
        });

        private RoutineDefinition Routine(params RoutineGoal[] goals)
        {
            var routine = Game.Asset<RoutineDefinition>();
            routine.Configure("base:fabia_routine", "base:fabia", new RoutinePlace("base:map-1", "home"), null,
                new[] { new RoutineEntry("default", null, goals, null) });
            return routine;
        }

        private static RoutineGoal Goal(string id, int hour, string map) =>
            new(id, hour * 60, null, map == null ? null : new RoutinePlace(map, "spot"), null);

        [Test]
        public void ChainsOfLinksReachOtherMaps()
        {
            Assert.That(Links.CanReach("base:map-1", "base:cellar"), Is.True);
            Assert.That(Links.CanReach("base:cellar", "base:map-1"), Is.False);
            Assert.That(Links.CanReach("base:island", "base:island"), Is.True, "A map always reaches itself.");
        }

        [Test]
        public void EachGoalMustBeReachableFromWhereTheCharacterComesFrom()
        {
            var fine = Routine(Goal("market", 8, "base:town"), Goal("cellar", 10, "base:cellar"));
            Assert.That(RoutineCatalogValidation.UnreachableGoals(fine, Links), Is.Empty);

            var stuck = Routine(Goal("cellar", 8, "base:cellar"), Goal("back_home", 10, null), Goal("island", 12, "base:island"));
            Assert.That(RoutineCatalogValidation.UnreachableGoals(stuck, Links).ToArray(), Is.EqualTo(new[]
            {
                "Routine 'base:fabia_routine': goal 'back_home' of 'default' goes to map 'base:map-1', but no location links lead there from map 'base:cellar'.",
                "Routine 'base:fabia_routine': goal 'island' of 'default' goes to map 'base:island', but no location links lead there from map 'base:map-1'."
            }));
        }

        [Test]
        public void TheProjectMapsAreJoinedByTheirLocationLinks()
        {
            var links = MapLinkGraph.Build(new[]
            {
                AssetDatabase.LoadAssetAtPath<VulcanusWorldCatalog>("Assets/Vulcan/0204project/vulcan.project.world.asset")
            });
            Assert.That(links.LinksFrom("base:map-1").Select(link => link.ToMapId), Is.EquivalentTo(new[] { "base:map-2", "base:indoor" }));
            Assert.That(links.CanReach("base:indoor", "base:map-2"), Is.True, "Through map-1.");
            Assert.That(links.LinksFrom("base:indoor").Single().ArrivalAnchorId, Is.Not.Empty);
        }
    }
}

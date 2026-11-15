using System.Linq;
using Core.Common.Editor;
using Core.Tile.Editor.Vulcanus;
using Core.Tile.Vulcanus;
using NUnit.Framework;
using UnityEditor;
using Core.Tile.Editor;
using Object = UnityEngine.Object;

namespace Core.Routines.Editor
{
    public sealed class RoutineReachabilityTests : GameTest
    {
        // map-1 <-> town, town -> cellar; nothing leads back out of the cellar or to the island.
        private static readonly MapLinkGraph Links = new(new[]
        {
            Link("base:map-1", "base:town", "gate"),
            Link("base:town", "base:map-1", "gate"),
            Link("base:town", "base:cellar", "stairs")
        });

        // Where the trigger is doesn't matter for which maps are joined.
        private static MapLink Link(string from, string to, string arrivalAnchor) => new(from, to, arrivalAnchor, default);

        private RoutineDefinition Routine(params string[] goals) => VulcanusJson.Populate(Game.Asset<RoutineDefinition>(),
            "{ id: 'base:fabia_routine', character: 'base:fabia', home: { map: 'base:map-1', anchor: 'home' }, " +
            $"variants: [{{ id: 'default', goals: [{string.Join(",", goals)}] }}] }}");

        private static string Goal(string id, int hour, string map) =>
            $"{{ id: '{id}', departAt: '{hour:00}:00', destination: {(map == null ? "'home'" : $"{{ map: '{map}', anchor: 'spot' }}")} }}";

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
            var world = TestWorld.Create();
            try
            {
                var links = MapLinkGraph.Build(new[] { world });
                Assert.That(links.LinksFrom("test:map-1").Select(link => link.ToMapId), Is.EquivalentTo(new[] { "test:map-2", "test:indoor" }));
                Assert.That(links.CanReach("test:indoor", "test:map-2"), Is.True, "Through map-1.");
                Assert.That(links.LinksFrom("test:indoor").Single().ArrivalAnchorId, Is.Not.Empty);
            }
            finally { Object.DestroyImmediate(world); }
        }
    }
}

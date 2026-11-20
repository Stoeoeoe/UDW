using System.Collections.Generic;
using System.Linq;
using Core.Common.Editor;
using Core.Tile.Editor.Vulcanus;
using Core.Tile.Vulcanus;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Core.Routines.Editor
{
    /// <summary>Timetables are planned from baked navigation data only; no map is loaded here.</summary>
    public sealed class RoutineTimetableTests : GameTest
    {
        // Two tiles per second at half a second per in-game minute: one tile per minute.
        private const float WalkSpeed = 2f, SecondsPerMinute = 0.5f;
        private const int Eight = 8 * 60;

        // A 10x5 town and a 5x5 shop. Cell (x, y)'s drawn tile has its middle at (x + 0.5, y).
        private const string Home = "{ map: 'base:town', anchor: 'home' }";
        private const string Well = "{ map: 'base:town', anchor: 'well' }";
        private const string Counter = "{ map: 'base:shop', anchor: 'counter' }";

        private static readonly Dictionary<string, Vector2> TownAnchors = new()
        {
            ["home"] = new Vector2(0.5f, 2), ["well"] = new Vector2(6.5f, 2)
        };
        private static readonly Dictionary<string, Vector2> ShopAnchors = new()
        {
            ["front"] = new Vector2(0.5f, 2), ["back"] = new Vector2(4.5f, 2), ["counter"] = new Vector2(2.5f, 2)
        };

        // Thin strips along the town's right and left edges, the way Vulcanus exits are drawn.
        private static readonly MapLink FrontDoor = new("base:town", "base:shop", "front", Rect.MinMaxRect(9.94f, -0.5f, 10f, 4.5f));
        private static readonly MapLink BackDoor = new("base:town", "base:shop", "back", Rect.MinMaxRect(0f, -0.5f, 0.06f, 4.5f));

        private static NavigationCostGrid Grid(int width, int height, params Vector2Int[] blocked)
        {
            var cells = new bool[width * height];
            foreach (var cell in blocked) cells[cell.y * width + cell.x] = true;
            return new NavigationCostGrid(width, height, Enumerable.Repeat((byte)1, width * height).ToArray(), cells);
        }

        private static WorldNavigation World(NavigationCostGrid town = null, params MapLink[] links) =>
            new(new[]
            {
                new NavigationMap("base:town", town ?? Grid(10, 5), TownAnchors),
                new NavigationMap("base:shop", Grid(5, 5), ShopAnchors)
            }, new MapLinkGraph(links));

        /// <summary>A day of these goals, starting at <paramref name="home"/>.</summary>
        private DayPlan DayFrom(string home, params string[] goals)
        {
            var routine = VulcanusJson.Populate(Game.Asset<RoutineDefinition>(),
                $"{{ id: 'base:fabia_routine', character: 'base:fabia', home: {home}, variants: [{{ id: 'default', goals: [{string.Join(",", goals)}] }}] }}");
            return new DayPlan(routine, "default", routine.Variants[0].Goals.Select(goal => new PlannedGoal(goal, routine.Home)).ToArray());
        }

        private DayPlan Day(params string[] goals) => DayFrom(Home, goals);

        private static string Goal(string id, int minute, string destination) =>
            $"{{ id: '{id}', departAt: '{minute / 60:00}:{minute % 60:00}', destination: {destination ?? "'home'"} }}";

        private static RoutineTimetable Plan(DayPlan day, WorldNavigation world) =>
            RoutineTimetablePlanner.Plan(day, world, WalkSpeed, SecondsPerMinute);

        [Test]
        public void TheDayIsStaysAndTheWalksBetweenThem()
        {
            var timetable = Plan(Day(Goal("well", Eight, Well)), World());

            Assert.That(timetable.Segments.Select(s => (s.IsWalk, s.GoalIndex, s.StartMinute, s.EndMinute)), Is.EqualTo(new[]
            {
                (false, -1, 0f, 480f), (true, 0, 480f, 486f), (false, 0, 486f, 1440f)
            }), "Six tiles at one tile per minute.");
            Assert.That(timetable.Segments[2].Place.ToString(), Is.EqualTo("base:town/well"));
            Assert.That(timetable.Warnings, Is.Empty);

            var walking = timetable.At(483);
            Assert.That(walking.IsWalk, Is.True);
            Assert.That(walking.PositionAt(483), Is.EqualTo(new Vector2(3.5f, 2)), "Halfway there.");
            Assert.That(timetable.At(100).PositionAt(100), Is.EqualTo(TownAnchors["home"]));
        }

        [Test]
        public void OccupationIsWhatTheGoalSaysOnceArrived()
        {
            var timetable = Plan(Day("{ id: 'well', departAt: '08:00', destination: " + Well + ", occupation: 'fishing' }",
                Goal("home", 12 * 60, null)), World());

            Assert.That(timetable.OccupationAt(100), Is.Null, "Nothing before the first goal.");
            Assert.That(timetable.OccupationAt(483), Is.Null, "Not while walking there.");
            Assert.That(timetable.OccupationAt(486), Is.EqualTo("fishing"));
            Assert.That(timetable.OccupationAt(700), Is.EqualTo("fishing"));
            Assert.That(timetable.OccupationAt(12 * 60 + 60), Is.Null, "The goal after has none.");
        }

        [Test]
        public void AWalkToAnotherMapIsSplitAtTheDoor()
        {
            var timetable = Plan(Day(Goal("shop", Eight, Counter)), World(null, FrontDoor));

            var toDoor = timetable.Segments[1];
            var inside = timetable.Segments[2];
            Assert.That((toDoor.MapId, toDoor.Enters, toDoor.Leaves), Is.EqualTo(("base:town", (MapLink)null, FrontDoor)));
            Assert.That(toDoor.Route[^1], Is.EqualTo(new Vector2(9.5f, 2)), "The walkable tile beside the exit strip.");
            Assert.That((inside.MapId, inside.Enters, inside.Leaves), Is.EqualTo(("base:shop", FrontDoor, (MapLink)null)));
            Assert.That(inside.Route[0], Is.EqualTo(ShopAnchors["front"]), "The walk goes on from the link's arrival anchor.");
            Assert.That((toDoor.StartMinute, toDoor.EndMinute, inside.EndMinute), Is.EqualTo((480f, 489f, 491f)),
                "Crossing takes no time.");
            Assert.That(timetable.At(489), Is.SameAs(inside), "At the door the character is already through it.");
            Assert.That(timetable.Segments[3].MapId, Is.EqualTo("base:shop"));
        }

        [Test]
        public void TheQuickestDoorIsTaken()
        {
            var timetable = Plan(Day(Goal("shop", Eight, Counter)), World(null, FrontDoor, BackDoor));
            Assert.That(timetable.Segments[1].Leaves, Is.SameAs(BackDoor), "The back door is beside home.");
            Assert.That(timetable.Segments[2].EndMinute, Is.EqualTo(482f));
        }

        [Test]
        public void AWalkThatOverrunsTheNextDepartureGoesStraightOn()
        {
            var timetable = Plan(Day(Goal("well", Eight, Well), Goal("back_home", Eight + 3, null)), World());

            Assert.That(timetable.Segments.Select(s => (s.IsWalk, s.StartMinute, s.EndMinute)), Is.EqualTo(new[]
            {
                (false, 0f, 480f), (true, 480f, 486f), (true, 486f, 492f), (false, 492f, 1440f)
            }));
        }

        [Test]
        public void WithoutARouteTheCharacterIsThereAtDeparture()
        {
            var walled = Grid(10, 5, Enumerable.Range(0, 5).Select(y => new Vector2Int(3, y)).ToArray());
            var timetable = Plan(Day(Goal("well", Eight, Well)), World(walled));

            Assert.That(timetable.Warnings.Single(), Does.Contain("no walkable route from 'base:town/home' to 'base:town/well'"));
            Assert.That(timetable.Segments.Select(s => (s.IsWalk, s.GoalIndex, s.StartMinute)), Is.EqualTo(new[]
            {
                (false, -1, 0f), (false, 0, 480f)
            }));
        }

        [Test]
        public void ADoorIsTheWalkableTileNearestTheMiddleOfItsTrigger()
        {
            var town = new NavigationMap("base:town", Grid(10, 5, new Vector2Int(9, 2)), TownAnchors);
            var beside = new MapLink("base:town", "base:shop", "front", Rect.MinMaxRect(9.94f, 1.6f, 10f, 2.6f));
            Assert.That(town.DoorPosition(beside), Is.EqualTo(new Vector2(9.5f, 3)), "Its own tile is blocked.");

            // Just below the bottom row, like the exit along the indoor map's bottom edge.
            var below = new MapLink("base:town", "base:shop", "front", Rect.MinMaxRect(3f, -0.56f, 4f, -0.5f));
            Assert.That(town.DoorPosition(below), Is.EqualTo(new Vector2(3.5f, 0)));
        }

        [Test]
        public void TheProjectHouseLeadsToMapTwoThroughMapOne()
        {
            var world = WorldNavigation.Build(new[] { AssetDatabase.LoadAssetAtPath<VulcanusWorldCatalog>("Assets/Tests/Vulcanus/vulcan.project.world.asset") });
            var day = DayFrom("{ map: 'test:indoor', anchor: 'anchor-1793894673996' }",
                Goal("visit", Eight, "{ map: 'test:map-2', anchor: 'anchor-1793894643329' }"));

            var timetable = RoutineTimetablePlanner.Plan(day, world, WalkSpeed, SecondsPerMinute);

            Assert.That(timetable.Warnings, Is.Empty);
            Assert.That(timetable.Segments.Where(s => s.IsWalk).Select(s => s.MapId),
                Is.EqualTo(new[] { "test:indoor", "test:map-1", "test:map-2" }));
        }
    }
}

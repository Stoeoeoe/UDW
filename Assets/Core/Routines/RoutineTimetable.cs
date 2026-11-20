using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Tile.Vulcanus;
using UnityEngine;

namespace Core.Routines
{
    /// <summary>
    /// A stretch of the day on one map: staying at a place, or walking a route. Positions are feet positions in the
    /// map's local space (see <see cref="NavigationMap"/>).
    /// </summary>
    public sealed class TimetableSegment
    {
        /// <summary>Walking a route; otherwise staying at <see cref="Place"/>.</summary>
        public bool IsWalk { get; }
        public string MapId { get; }
        /// <summary>Minutes after midnight.</summary>
        public float StartMinute { get; }
        public float EndMinute { get; }
        /// <summary>The goal walked to or stayed at; -1 at home before the first departure.</summary>
        public int GoalIndex { get; }
        /// <summary>Where the character stays; null for a walk.</summary>
        public RoutinePlace Place { get; }
        /// <summary>Feet positions in walking order, starting where the walk starts; a stay has its one position.</summary>
        public IReadOnlyList<Vector2> Route { get; }
        public float Length { get; }
        /// <summary>The link this walk came through, starting at its arrival anchor; null when it starts on this map.</summary>
        public MapLink Enters { get; }
        /// <summary>The link this walk ends at and crosses; null when it ends at the goal.</summary>
        public MapLink Leaves { get; }

        private TimetableSegment(bool isWalk, string mapId, float startMinute, float endMinute, int goalIndex, RoutinePlace place,
            IReadOnlyList<Vector2> route, MapLink enters, MapLink leaves)
        {
            IsWalk = isWalk;
            MapId = mapId;
            StartMinute = startMinute;
            EndMinute = endMinute;
            GoalIndex = goalIndex;
            Place = place;
            Route = route;
            Enters = enters;
            Leaves = leaves;
            for (var i = 1; i < route.Count; i++) Length += Vector2.Distance(route[i - 1], route[i]);
        }

        internal static TimetableSegment Stay(int goalIndex, RoutinePlace place, Vector2 position, float start, float end) =>
            new(false, place.Map, start, end, goalIndex, place, new[] { position }, null, null);

        internal static TimetableSegment Walk(int goalIndex, TimetableLeg leg, float start, float end) =>
            new(true, leg.MapId, start, end, goalIndex, null, leg.Route, leg.Enters, leg.Leaves);

        /// <summary>Where the character is at a minute within this segment, walking at an even pace.</summary>
        public Vector2 PositionAt(float minute)
        {
            if (minute < StartMinute || minute > EndMinute)
                throw new ArgumentOutOfRangeException(nameof(minute), $"Minute {minute} is outside {StartMinute}-{EndMinute}.");
            if (EndMinute <= StartMinute) return Route[^1];
            var distance = Length * (minute - StartMinute) / (EndMinute - StartMinute);
            for (var i = 1; i < Route.Count; i++)
            {
                var step = Vector2.Distance(Route[i - 1], Route[i]);
                if (distance <= step) return step > 0 ? Vector2.Lerp(Route[i - 1], Route[i], distance / step) : Route[i];
                distance -= step;
            }
            return Route[^1];
        }
    }

    /// <summary>
    /// One character's planned day, minute by minute across maps: where they stay, and every walk between, split at the
    /// doors they cross. Built from the baked navigation data, so it answers for maps that aren't loaded.
    /// </summary>
    public sealed class RoutineTimetable
    {
        public DayPlan Plan { get; }
        /// <summary>In time order, covering the whole day without gaps. Crossing a door takes no time.</summary>
        public IReadOnlyList<TimetableSegment> Segments { get; }
        /// <summary>Goals the character could not walk to; they are at the destination as soon as they set off.</summary>
        public IReadOnlyList<string> Warnings { get; }

        internal RoutineTimetable(DayPlan plan, IReadOnlyList<TimetableSegment> segments, IReadOnlyList<string> warnings)
        {
            Plan = plan;
            Segments = segments;
            Warnings = warnings;
        }

        /// <summary>The segment the character is in at a minute; at a door, the walk on the far side.</summary>
        public TimetableSegment At(float minute) => Segments[IndexAt(minute)];

        /// <summary>
        /// What the character is busy with at a minute: the occupation of the goal they have arrived at. Null while walking,
        /// before the first goal, or when the goal has none.
        /// </summary>
        public string OccupationAt(float minute)
        {
            var segment = At(minute);
            if (segment.IsWalk || segment.GoalIndex < 0) return null;
            var occupation = Plan.Goals[segment.GoalIndex].Occupation;
            return string.IsNullOrEmpty(occupation) ? null : occupation;
        }

        /// <summary>The index of <see cref="At"/>'s segment in <see cref="Segments"/>.</summary>
        public int IndexAt(float minute)
        {
            if (minute < 0 || minute > RoutineValidator.MinutesPerDay)
                throw new ArgumentOutOfRangeException(nameof(minute), "Use minutes after midnight.");
            var index = 0;
            while (index + 1 < Segments.Count && Segments[index + 1].StartMinute <= minute) index++;
            return index;
        }
    }

    /// <summary>The part of a walk on one map.</summary>
    internal readonly struct TimetableLeg
    {
        public readonly string MapId;
        public readonly IReadOnlyList<Vector2> Route;
        public readonly float Length;
        public readonly MapLink Enters;
        public readonly MapLink Leaves;

        public TimetableLeg(string mapId, IReadOnlyList<Vector2> route, float length, MapLink enters, MapLink leaves)
        {
            MapId = mapId;
            Route = route;
            Length = length;
            Enters = enters;
            Leaves = leaves;
        }
    }

    /// <summary>Turns a <see cref="DayPlan"/> into a <see cref="RoutineTimetable"/>.</summary>
    public static class RoutineTimetablePlanner
    {
        /// <param name="walkSpeed">Tiles per second, as <c>CharacterAttributes.WalkSpeed</c>.</param>
        /// <param name="secondsPerMinute">Real seconds per in-game minute, <c>ClockSettings.SecondsPerMinute</c>.</param>
        public static RoutineTimetable Plan(DayPlan plan, WorldNavigation world, float walkSpeed, float secondsPerMinute)
        {
            if (!(walkSpeed > 0)) throw new ArgumentOutOfRangeException(nameof(walkSpeed));
            if (!(secondsPerMinute > 0)) throw new ArgumentOutOfRangeException(nameof(secondsPerMinute));
            var tilesPerMinute = walkSpeed * secondsPerMinute;
            var segments = new List<TimetableSegment>();
            var warnings = new List<string>();

            var place = plan.Routine.Home;
            var goalIndex = -1;
            var minute = 0f;
            for (var i = 0; i < plan.Goals.Count; i++)
            {
                var goal = plan.Goals[i];
                // Still walking when the next departure comes, the character sets off again on arrival.
                var departure = Mathf.Max(goal.DepartMinute, minute);
                if (departure > minute) segments.Add(StayAt(world, goalIndex, place, minute, departure));
                minute = departure;

                var legs = FindLegs(world, place, goal.Destination);
                if (legs == null)
                    warnings.Add($"Routine '{plan.Routine.Id}': no walkable route from '{place}' to '{goal.Destination}' " +
                        $"for goal '{goal.Id}'. The character is there as soon as they set off.");
                else
                    foreach (var leg in legs)
                    {
                        var arrival = minute + leg.Length / tilesPerMinute;
                        segments.Add(TimetableSegment.Walk(i, leg, minute, arrival));
                        minute = arrival;
                    }
                place = goal.Destination;
                goalIndex = i;
            }
            if (minute < RoutineValidator.MinutesPerDay)
                segments.Add(StayAt(world, goalIndex, place, minute, RoutineValidator.MinutesPerDay));
            return new RoutineTimetable(plan, segments, warnings);
        }

        private static TimetableSegment StayAt(WorldNavigation world, int goalIndex, RoutinePlace place, float start, float end) =>
            TimetableSegment.Stay(goalIndex, place, world.Map(place.Map).Anchor(place.Anchor), start, end);

        /// <summary>A step of the search: standing on a map, having come this far.</summary>
        private sealed class Stop
        {
            public string MapId;
            public Vector2 Position;
            public float Distance;
            /// <summary>Links crossed to get here.</summary>
            public int Crossings;
            /// <summary>The link that led here; null at the start.</summary>
            public MapLink Entered;
            public Stop Previous;
            /// <summary>The walk from <see cref="Previous"/> to the door of <see cref="Entered"/>.</summary>
            public Walk Walk;
            public bool IsGoal;
        }

        private readonly struct Walk
        {
            public readonly IReadOnlyList<Vector2> Route;
            public readonly float Length;

            public Walk(IReadOnlyList<Vector2> route, float length)
            {
                Route = route;
                Length = length;
            }
        }

        /// <summary>
        /// The walk from one place to another through the fewest maps, and the shortest of those; null when none exists.
        /// Characters don't pass through another map to save a few steps. Dijkstra over the links, each crossed at most
        /// once, arriving at its anchor.
        /// </summary>
        private static List<TimetableLeg> FindLegs(WorldNavigation world, RoutinePlace from, RoutinePlace to)
        {
            var start = new Stop { MapId = from.Map, Position = world.Map(from.Map).Anchor(from.Anchor) };
            var open = new List<Stop> { start };
            var crossed = new HashSet<MapLink>();
            while (open.Count > 0)
            {
                var stop = open.OrderBy(candidate => candidate.Crossings).ThenBy(candidate => candidate.Distance).First();
                open.Remove(stop);
                if (stop.IsGoal) return Legs(stop);
                // The first time a link comes out of the queue is the shortest way through it.
                if (stop.Entered != null && !crossed.Add(stop.Entered)) continue;
                var map = world.Map(stop.MapId);
                if (stop.MapId == to.Map
                    && TryWalk(map, stop.Position, map.Anchor(to.Anchor), out var toGoal))
                    open.Add(new Stop { MapId = stop.MapId, Position = toGoal.Route[^1], Distance = stop.Distance + toGoal.Length,
                        Crossings = stop.Crossings, Previous = stop, Walk = toGoal, IsGoal = true });
                foreach (var link in world.Links.LinksFrom(stop.MapId))
                {
                    // Links within a map are shortcuts the player takes; characters walk.
                    if (link.ToMapId == stop.MapId || crossed.Contains(link)) continue;
                    if (!TryWalk(map, stop.Position, map.DoorPosition(link), out var toDoor)) continue;
                    open.Add(new Stop { MapId = link.ToMapId, Position = world.Map(link.ToMapId).Anchor(link.ArrivalAnchorId),
                        Distance = stop.Distance + toDoor.Length, Crossings = stop.Crossings + 1, Entered = link, Previous = stop,
                        Walk = toDoor });
                }
            }
            return null;
        }

        /// <summary>One leg per map, from the start to the goal.</summary>
        private static List<TimetableLeg> Legs(Stop goal)
        {
            var legs = new List<TimetableLeg>();
            MapLink leaves = null;
            for (var stop = goal; stop.Previous != null; stop = stop.Previous)
            {
                legs.Add(new TimetableLeg(stop.Previous.MapId, stop.Walk.Route, stop.Walk.Length, stop.Previous.Entered, leaves));
                leaves = stop.Previous.Entered;
            }
            legs.Reverse();
            return legs;
        }

        /// <summary>The route the navigation grid gives, as <c>NavigationPlan</c> walks it in a loaded map.</summary>
        private static bool TryWalk(NavigationMap map, Vector2 from, Vector2 to, out Walk walk)
        {
            var grid = map.Grid;
            var found = GridPathfinder.TryFindPath(NavigationMap.CellAt(from), NavigationMap.CellAt(to),
                new RectInt(0, 0, grid.Width, grid.Height), (Vector2Int cell, out int cost) =>
                {
                    cost = 0;
                    if (!grid.Contains(cell) || grid.IsBlocked(cell)) return false;
                    cost = grid.GetCost(cell);
                    return true;
                }, out var cells, out _);
            if (!found)
            {
                walk = default;
                return false;
            }
            var route = new List<Vector2> { from };
            for (var i = 0; i < cells.Count - 1; i++) route.Add(NavigationMap.CellCenter(cells[i]));
            route.Add(to); // the exact destination, not its tile's middle
            var length = 0f;
            for (var i = 1; i < route.Count; i++) length += Vector2.Distance(route[i - 1], route[i]);
            walk = new Walk(route, length);
            return true;
        }
    }
}

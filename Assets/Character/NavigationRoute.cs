using System;
using System.Collections.Generic;
using Core.Tile;
using UnityEngine;

namespace Character
{
    /// <summary>
    /// A weighted tile route from a character's current position on the current map, planned without moving it.
    /// Walls block it (checked with physics in the loaded scene); other characters never do.
    /// </summary>
    public sealed class NavigationPlan
    {
        // The footprint is shrunk slightly so a character may pass flush against a wall.
        private const float FootprintShrink = 0.9f;

        public bool Found { get; private set; }
        public string Error { get; private set; }
        /// <summary>Feet position the route starts from: the character's position when planned.</summary>
        public Vector2 StartFeet { get; private set; }
        /// <summary>Feet positions in walking order; the last is the exact destination.</summary>
        public IReadOnlyList<Vector2> Waypoints { get; private set; } = Array.Empty<Vector2>();
        public float TotalCost { get; private set; }
        /// <summary>World distance walked from <see cref="StartFeet"/> through every waypoint.</summary>
        public float Length { get; private set; }

        internal static NavigationPlan Create(GameCharacter actor, Vector2 destinationFeet, MapManager maps)
        {
            if (!actor) throw new ArgumentNullException(nameof(actor));
            if (!maps) throw new ArgumentNullException(nameof(maps));
            if (!float.IsFinite(destinationFeet.x) || !float.IsFinite(destinationFeet.y))
                throw new ArgumentException("Navigation requires a finite world position.", nameof(destinationFeet));
            var grid = maps.CurrentMap.NavigationCosts
                ?? throw new InvalidOperationException($"Map '{maps.CurrentMap.MapId}' has no baked navigation costs; reimport it.");

            var body = actor.GetComponent<Rigidbody2D>();
            // Boxes and filters stay constant while planning, so each collider is read once.
            var footprint = new List<(Vector2 center, Vector2 size, ContactFilter2D filter)>();
            foreach (var collider in body.GetComponentsInChildren<Collider2D>(true))
            {
                if (collider.attachedRigidbody != body || collider.isTrigger || !collider.isActiveAndEnabled) continue;
                // Characters never block navigation, so their layer is left out of the query (this includes the walker).
                var filter = new ContactFilter2D { useTriggers = false };
                filter.SetLayerMask(Physics2D.GetLayerCollisionMask(collider.gameObject.layer) & ~NavigationMove.CharactersLayerMask);
                var bounds = collider.bounds;
                footprint.Add((bounds.center, (Vector2)bounds.size * FootprintShrink, filter));
            }
            if (footprint.Count == 0)
                throw new InvalidOperationException("Character navigation requires an active physical collider.");

            // Destinations and cells are feet positions; the body is offset from the feet like in characters.walkPath.
            var startFeet = body.position + FeetOffset(actor);
            var start = maps.WorldToVisualTile(startFeet);
            var goal = maps.WorldToVisualTile(destinationFeet);
            var blocked = new Dictionary<Vector2Int, bool>();
            var hits = new Collider2D[1];

            bool IsBlocked(Vector2Int cell)
            {
                if (blocked.TryGetValue(cell, out var cached)) return cached;
                var shift = maps.TileToVisualCenter(cell) - startFeet;
                var result = false;
                foreach (var (center, size, filter) in footprint)
                {
                    if (Physics2D.OverlapBox(center + shift, size, 0f, filter, hits) > 0)
                    {
                        result = true;
                        break;
                    }
                }
                blocked[cell] = result;
                return result;
            }

            var mapBounds = new RectInt(0, 0, grid.Width, grid.Height);
            var found = GridPathfinder.TryFindPath(start, goal, mapBounds, (Vector2Int cell, out int cost) =>
            {
                cost = 0;
                if (!grid.Contains(cell) || IsBlocked(cell)) return false;
                cost = grid.GetCost(cell);
                return true;
            }, out var cells, out var totalCost);

#if UNITY_EDITOR
            NavigationDebug.Publish(start, goal, blocked, cells, found);
#endif
            var plan = new NavigationPlan { Found = found, StartFeet = startFeet };
            if (!found)
            {
                plan.Error = $"No route for character '{actor.name}' from tile {start} to tile {goal} " +
                    $"(destination {destinationFeet.ToString("F3")}).";
                return plan;
            }

            var feet = new List<Vector2>();
            for (var i = 0; i < cells.Count - 1; i++) feet.Add(maps.TileToVisualCenter(cells[i]));
            feet.Add(destinationFeet); // the final waypoint is the exact destination, not the tile's middle
            plan.Waypoints = feet;
            plan.TotalCost = totalCost;
            var previous = startFeet;
            foreach (var point in feet)
            {
                plan.Length += Vector2.Distance(previous, point);
                previous = point;
            }
            return plan;
        }

        /// <summary>Feet position after walking this far along the route; the destination once the whole route is walked.</summary>
        public Vector2 PointAt(float distance)
        {
            if (!Found) throw new InvalidOperationException("An unreachable plan has no route.");
            if (!float.IsFinite(distance) || distance < 0) throw new ArgumentOutOfRangeException(nameof(distance));
            var previous = StartFeet;
            foreach (var point in Waypoints)
            {
                var segment = Vector2.Distance(previous, point);
                if (distance <= segment) return segment > 0 ? Vector2.Lerp(previous, point, distance / segment) : point;
                distance -= segment;
                previous = point;
            }
            return previous;
        }

        internal static Vector2 FeetOffset(GameCharacter actor) => (Vector2)(actor.Graphics.position - actor.transform.position);
    }

    /// <summary>
    /// Walks a <see cref="NavigationPlan"/> segment by segment through other characters.
    /// Planning happens at construction; there is no re-planning while walking.
    /// </summary>
    /// <remarks>The caller ticks this route each frame and disposes it when interrupted.</remarks>
    public sealed class NavigationRoute : IDisposable
    {
        private readonly GameCharacter _actor;
        private readonly bool _immediateAcceleration;
        private readonly List<Vector2> _bodyWaypoints = new();
        private NavigationMove _move;
        private int _index;
        private bool _disposed;

        public NavigationMoveStatus Status { get; private set; } = NavigationMoveStatus.Moving;
        public string Error { get; private set; }
        /// <summary>World positions (feet) walked in order; the last is the exact destination.</summary>
        public IReadOnlyList<Vector2> Waypoints { get; }
        public float TotalCost { get; }

        internal NavigationRoute(GameCharacter actor, Vector2 destinationFeet, MapManager maps, bool immediateAcceleration)
        {
            var plan = NavigationPlan.Create(actor, destinationFeet, maps);
            _actor = actor;
            _immediateAcceleration = immediateAcceleration;
            Waypoints = plan.Waypoints;
            TotalCost = plan.TotalCost;
            if (!plan.Found)
            {
                Status = NavigationMoveStatus.Unreachable;
                Error = plan.Error;
                _disposed = true;
                return;
            }

            var feetOffset = NavigationPlan.FeetOffset(actor);
            foreach (var point in plan.Waypoints) _bodyWaypoints.Add(point - feetOffset);
            StartSegment();
#if UNITY_EDITOR
            if (!_disposed) NavigationDebug.Register(this);
#endif
        }

        private void StartSegment()
        {
            _move = new NavigationMove(_actor, _bodyWaypoints[_index], _immediateAcceleration, false, passThroughCharacters: true);
            if (_move.Status == NavigationMoveStatus.Unreachable)
                Finish(NavigationMoveStatus.Unreachable,
                    $"Route segment {_index + 1}/{_bodyWaypoints.Count} (feet {Waypoints[_index].ToString("F3")}): {_move.Error}");
        }

        public void Tick(float deltaTime)
        {
            if (_disposed) return;
            _move.Tick(deltaTime);
            while (!_disposed && _move.Status == NavigationMoveStatus.Arrived)
            {
                _move.Dispose();
                if (++_index == _bodyWaypoints.Count)
                {
                    Finish(NavigationMoveStatus.Arrived, null);
                    return;
                }
                StartSegment();
            }
            if (!_disposed && _move.Status is NavigationMoveStatus.Cancelled or NavigationMoveStatus.Unreachable)
                Finish(_move.Status, _move.Error);
        }

        private void Finish(NavigationMoveStatus status, string error)
        {
            Status = status;
            Error = error;
            Dispose();
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            if (Status == NavigationMoveStatus.Moving) Status = NavigationMoveStatus.Cancelled;
            _move?.Dispose(); // Restores collider exclusions and releases the controller.
#if UNITY_EDITOR
            NavigationDebug.Unregister(this);
#endif
        }
    }
}

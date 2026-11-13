using System;
using System.Collections.Generic;
using UnityEngine;

namespace Character
{
    public enum NavigationMoveStatus { Moving, Arrived, Unreachable, Cancelled }

    /// <summary>Shared entry point for character movement. Currently supports straight-line routes only.</summary>
    public static class CharacterNavigation
    {
        /// <summary>
        /// Plans the cheapest tile route to a feet position on the current map and walks it, through other characters
        /// but not through walls or objects. Same lifecycle as <see cref="MoveTo"/>: tick it, dispose it when interrupted.
        /// </summary>
        public static NavigationRoute NavigateTo(GameCharacter actor, Vector2 destination, Core.Tile.MapManager maps,
            bool immediateAcceleration = true) => new(actor, destination, maps, immediateAcceleration);

        /// <summary>Plans the route <see cref="NavigateTo"/> would walk from the character's position, without moving it.</summary>
        public static NavigationPlan PlanRoute(GameCharacter actor, Vector2 destination, Core.Tile.MapManager maps) =>
            NavigationPlan.Create(actor, destination, maps);

        public static NavigationMove MoveTo(GameCharacter actor, Vector2 destination, bool immediateAcceleration = false,
            bool ignoreCollisions = false) => new(actor, destination, immediateAcceleration, ignoreCollisions);
    }

    /// <summary>Walks to a position and owns movement until arrival or cancellation.</summary>
    /// <remarks>The caller ticks this move each frame and disposes it when interrupted.</remarks>
    public sealed class NavigationMove : IDisposable
    {
        private const float ArrivalDistance = 0.04f;
        private readonly GameCharacter _actor;
        private readonly Controller2D _controller;
        private readonly Rigidbody2D _body;
        private readonly Vector2 _destination;
        private readonly Vector2 _facing;
        private readonly float _speed;
        private readonly bool _immediateAcceleration;
        private readonly bool _ignoreCollisions;
        private readonly int _passThroughMask; // layers of characters this move walks through; 0 = none
        private readonly List<(Collider2D collider, LayerMask excluded, int priority, int queryMask)> _collisionOverrides = new();
        private readonly List<Collider2D> _overlaps = new();
        private readonly HashSet<Collider2D> _warnedObstacles = new();
        private bool _disposed;

        public NavigationMoveStatus Status { get; private set; } = NavigationMoveStatus.Moving;
        public string Error { get; private set; }

        /// <summary>The physics layer shared by every character's solid colliders.</summary>
        internal const string CharactersLayerName = "Characters";

        internal static int CharactersLayerMask
        {
            get
            {
                var layer = LayerMask.NameToLayer(CharactersLayerName);
                if (layer < 0) throw new InvalidOperationException($"Physics layer '{CharactersLayerName}' is missing from the project.");
                return 1 << layer;
            }
        }

        /// <param name="passThroughCharacters">Walk through other characters (player and NPCs) while still colliding with everything else.</param>
        internal NavigationMove(GameCharacter actor, Vector2 destination, bool immediateAcceleration, bool ignoreCollisions,
            bool passThroughCharacters = false)
        {
            if (!actor) throw new ArgumentNullException(nameof(actor));
            if (!actor.isActiveAndEnabled || !actor.IsRuntimeInitialized)
                throw new InvalidOperationException("MoveTo requires a live initialized character.");
            if (!float.IsFinite(destination.x) || !float.IsFinite(destination.y))
                throw new ArgumentException("MoveTo requires a finite world position.", nameof(destination));
            if (actor.ConditionState != ConditionState.Normal || actor.Occupation.IsOccupied)
                throw new InvalidOperationException("MoveTo requires a character that can walk.");

            _actor = actor;
            _controller = actor.Controller;
            _body = actor.GetComponent<Rigidbody2D>();
            if (!_controller.isActiveAndEnabled || !_body.simulated || _body.bodyType != RigidbodyType2D.Dynamic)
                throw new InvalidOperationException("MoveTo requires an active controller and simulated dynamic Rigidbody2D.");
            _speed = actor.Attributes.WalkSpeed;
            if (!float.IsFinite(_speed) || _speed <= 0)
                throw new InvalidOperationException("MoveTo requires a positive walk speed.");
            _destination = destination;
            _immediateAcceleration = immediateAcceleration;
            _ignoreCollisions = ignoreCollisions;
            _passThroughMask = passThroughCharacters ? CharactersLayerMask : 0;
            // A straight segment keeps one animation facing even when physics nudges the
            // remaining direction across a diagonal boundary. Exact diagonals face horizontally,
            // matching the animation library's 45-degree sectors.
            var direction = destination - _body.position;
            _facing = Mathf.Abs(direction.x) >= Mathf.Abs(direction.y)
                ? (direction.x >= 0 ? Vector2.right : Vector2.left)
                : (direction.y >= 0 ? Vector2.up : Vector2.down);

            // Check the actual character footprint before starting. This version cannot take a detour.
            if (!HasClearDirectRoute(out var obstruction) && !ignoreCollisions)
            {
                Status = NavigationMoveStatus.Unreachable;
                Error = $"No clear straight-line route to the destination. Character '{actor.name}', " +
                    $"from {_body.position.ToString("F3")} to {_destination.ToString("F3")}: {obstruction}";
                _disposed = true;
                return;
            }

            // Block ordinary input while this move controls the character.
            _controller.ClaimMovement(this);
            _actor.SetControlBlocked(this, true);
            if (ignoreCollisions || passThroughCharacters)
            {
                foreach (var collider in _body.GetComponentsInChildren<Collider2D>(true))
                {
                    if (collider.attachedRigidbody != _body || collider.isTrigger || !collider.isActiveAndEnabled) continue;
                    var queryMask = (Physics2D.GetLayerCollisionMask(collider.gameObject.layer) |
                        collider.includeLayers.value) & ~collider.excludeLayers.value;
                    _collisionOverrides.Add((collider, collider.excludeLayers, collider.layerOverridePriority, queryMask));
                    // Pass-through excludes characters only; walls and objects keep their contacts.
                    collider.excludeLayers = ignoreCollisions ? ~0 : collider.excludeLayers.value | _passThroughMask;
                    collider.layerOverridePriority = int.MaxValue;
                }
            }
        }

        private bool HasClearDirectRoute(out string obstruction)
        {
            obstruction = null;
            var colliders = _body.GetComponentsInChildren<Collider2D>(true);
            var hasFootprint = false;
            var remaining = _destination - _body.position;
            var hits = new RaycastHit2D[1];
            foreach (var collider in colliders)
            {
                // Ignore interaction sensors and colliders belonging to another body.
                if (collider.attachedRigidbody != _body || collider.isTrigger || !collider.isActiveAndEnabled) continue;
                hasFootprint = true;
                var filter = new ContactFilter2D { useTriggers = false };
                filter.SetLayerMask(Physics2D.GetLayerCollisionMask(collider.gameObject.layer) & ~_passThroughMask);
                if (remaining.magnitude > ArrivalDistance && collider.Cast(remaining.normalized, filter, hits, remaining.magnitude) > 0)
                {
                    var hit = hits[0];
                    obstruction = $"'{hit.collider.name}' ({hit.collider.GetType().Name}, " +
                        $"layer '{LayerMask.LayerToName(hit.collider.gameObject.layer)}') blocks '{collider.name}' " +
                        $"at distance {hit.distance:F3}, hit point {hit.point.ToString("F3")}.";
                    return false;
                }
            }
            if (!hasFootprint) throw new InvalidOperationException("Character navigation requires an active physical collider.");
            return true;
        }

        public void Tick(float deltaTime)
        {
            if (!float.IsFinite(deltaTime) || deltaTime < 0) throw new ArgumentOutOfRangeException(nameof(deltaTime));
            if (_disposed) return;
            if (!_actor || !_actor.isActiveAndEnabled)
            {
                Finish(NavigationMoveStatus.Cancelled, "The actor left the live world.");
                return;
            }
            if (_actor.ConditionState != ConditionState.Normal || _actor.Occupation.IsOccupied || !_body.simulated)
            {
                Finish(NavigationMoveStatus.Cancelled, "The actor can no longer walk.");
                return;
            }

            if (_ignoreCollisions) WarnAboutOverlaps();
            var remaining = _destination - _body.position;
            if (remaining.magnitude <= ArrivalDistance)
            {
                Finish(NavigationMoveStatus.Arrived, null);
                return;
            }

            // Immediate walks keep their speed until the final physics step. Limit that
            // step to the remaining distance so short segments cannot overshoot and oscillate.
            var speed = Mathf.Min(_speed, _immediateAcceleration
                ? remaining.magnitude / Time.fixedDeltaTime : remaining.magnitude * 8f);
            _controller.SetOwnedMovementInput(this, remaining.normalized, speed, _immediateAcceleration);
            _actor.Orientation.UpdateFromInput(_facing);
            _actor.SetMovementState(MovementState.Walking);
        }

        private void WarnAboutOverlaps()
        {
            foreach (var state in _collisionOverrides)
            {
                var filter = new ContactFilter2D { useTriggers = false };
                filter.SetLayerMask(state.queryMask);
                state.collider.Overlap(filter, _overlaps);
                foreach (var obstacle in _overlaps)
                {
                    if (obstacle.attachedRigidbody == _body || !_warnedObstacles.Add(obstacle)) continue;
                    Debug.LogWarning($"Collision ignored during movement: character '{_actor.name}' overlaps " +
                        $"'{obstacle.name}' ({obstacle.GetType().Name}, layer '{LayerMask.LayerToName(obstacle.gameObject.layer)}'). " +
                        "Adjust the cutscene staging or path if this overlap is unintended.", _actor);
                }
            }
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
            foreach (var state in _collisionOverrides)
            {
                // A scene unload may have destroyed the collider before its action is disposed.
                if (!state.collider) continue;
                state.collider.excludeLayers = state.excluded;
                state.collider.layerOverridePriority = state.priority;
            }
            // Scene teardown can already have destroyed the actor or controller.
            if (_controller) _controller.ReleaseMovement(this);
            if (_actor)
            {
                _actor.SetControlBlocked(this, false);
                _actor.SetMovementState(MovementState.Idle);
            }
        }
    }
}

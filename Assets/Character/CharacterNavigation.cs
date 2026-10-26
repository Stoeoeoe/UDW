using System;
using UnityEngine;

namespace Character
{
    public enum NavigationMoveStatus { Moving, Arrived, Unreachable, Cancelled }

    /// <summary>Shared entry point for character movement. Currently supports straight-line routes only.</summary>
    public static class CharacterNavigation
    {
        public static NavigationMove MoveTo(GameCharacter actor, Vector2 destination) =>
            new(actor, destination);
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
        private readonly float _speed;
        private bool _disposed;

        public NavigationMoveStatus Status { get; private set; } = NavigationMoveStatus.Moving;
        public string Error { get; private set; }

        internal NavigationMove(GameCharacter actor, Vector2 destination)
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

            // Check the actual character footprint before starting. This version cannot take a detour.
            if (!HasClearDirectRoute(out var obstruction))
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
                filter.SetLayerMask(Physics2D.GetLayerCollisionMask(collider.gameObject.layer));
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

            var remaining = _destination - _body.position;
            if (remaining.magnitude <= ArrivalDistance)
            {
                Finish(NavigationMoveStatus.Arrived, null);
                return;
            }

            // Ease off near the target so the actor can stop inside the arrival distance.
            var speed = Mathf.Min(_speed, remaining.magnitude * 8f);
            _controller.SetOwnedMovementInput(this, remaining.normalized, speed);
            _actor.Orientation.UpdateFromInput(remaining.normalized);
            _actor.SetMovementState(MovementState.Walking);
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

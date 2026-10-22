using System;
using Character;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>Walks a live character straight to a world position using its normal physics controller.</summary>
    /// <remarks>Walls still block movement. Arrival, timeout and cancellation all release control and stop the actor.</remarks>
    public sealed class MoveToAction : ILuaAction
    {
        private const float ArrivalDistance = 0.04f;
        private readonly GameCharacter _actor;
        private readonly Controller2D _controller;
        private readonly Rigidbody2D _body;
        private readonly Vector2 _destination;
        private readonly float _speed;
        private readonly float _timeout;
        private float _elapsed;
        private bool _disposed;

        public LuaExecutionStatus Status { get; private set; } = LuaExecutionStatus.Running;
        public string Error { get; private set; }

        public MoveToAction(GameCharacter actor, Vector2 destination, float timeoutSeconds)
        {
            if (!actor) throw new ArgumentNullException(nameof(actor));
            if (!actor.isActiveAndEnabled || !actor.IsRuntimeInitialized)
                throw new InvalidOperationException("MoveTo requires a live initialized character.");
            if (!float.IsFinite(destination.x) || !float.IsFinite(destination.y))
                throw new ArgumentException("MoveTo requires a finite world position.", nameof(destination));
            if (!float.IsFinite(timeoutSeconds) || timeoutSeconds <= 0)
                throw new ArgumentOutOfRangeException(nameof(timeoutSeconds));
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
            _timeout = timeoutSeconds;

            // The action owns movement and blocks the actor's other input-driven abilities until it ends.
            _controller.ClaimMovement(this);
            _actor.SetControlBlocked(this, true);
        }

        public void Tick(float deltaTime)
        {
            if (!float.IsFinite(deltaTime) || deltaTime < 0) throw new ArgumentOutOfRangeException(nameof(deltaTime));
            if (_disposed) return;
            if (!_actor || !_actor.isActiveAndEnabled)
            {
                Finish(LuaExecutionStatus.Cancelled, "The actor left the live world.");
                return;
            }
            if (_actor.ConditionState != ConditionState.Normal || _actor.Occupation.IsOccupied || !_body.simulated)
            {
                Finish(LuaExecutionStatus.Cancelled, "The actor can no longer walk.");
                return;
            }
            _elapsed += deltaTime;
            if (_elapsed >= _timeout)
            {
                Finish(LuaExecutionStatus.TimedOut, "The actor did not reach the destination in time.");
                return;
            }

            var remaining = _destination - _body.position;
            if (remaining.magnitude <= ArrivalDistance)
            {
                Finish(LuaExecutionStatus.Succeeded, null);
                return;
            }

            // Ease off near the target so the actor can stop inside the arrival distance.
            var speed = Mathf.Min(_speed, remaining.magnitude * 8f);
            _controller.SetOwnedMovementInput(this, remaining.normalized, speed);
            _actor.Orientation.UpdateFromInput(remaining.normalized);
            _actor.SetMovementState(MovementState.Walking);
        }

        private void Finish(LuaExecutionStatus status, string error)
        {
            Status = status;
            Error = error;
            Dispose();
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            if (Status == LuaExecutionStatus.Running) Status = LuaExecutionStatus.Cancelled;
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

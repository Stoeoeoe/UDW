using System;
using UnityEngine;

namespace Character
{
    /// <summary>
    /// Thin physics controller. Drives Rigidbody2D velocity based on input set by abilities.
    /// </summary>
    [RequireComponent(typeof(Rigidbody2D))]
    public class Controller2D : MonoBehaviour
    {
        [SerializeField] float _acceleration = 60f;
        [SerializeField] float _deceleration = 60f;

        public Vector2 CurrentVelocity => _rb.linearVelocity;

        /// <summary>
        /// Last non-zero movement direction. Used by Orientation2D and tile queries.
        /// </summary>
        public Vector2 CurrentDirection { get; private set; } = Vector2.down;

        Rigidbody2D _rb;
        Vector2 _movementInput;
        float _maxSpeed;
        object _movementOwner;

        public bool IsMovementOwned => _movementOwner != null;

        void Awake() => _rb = GetComponent<Rigidbody2D>();

        /// <summary>Called by the MovementAbility each Update to set desired direction and speed.</summary>
        public void SetMovementInput(Vector2 input, float maxSpeed)
        {
            if (IsMovementOwned)
                throw new InvalidOperationException("Ordinary input cannot overwrite owned movement.");
            _movementInput = input;
            _maxSpeed = maxSpeed;
        }

        /// <summary>Gives one action control of movement until it calls ReleaseMovement.</summary>
        public void ClaimMovement(object owner)
        {
            if (owner == null) throw new ArgumentNullException(nameof(owner));
            if (IsMovementOwned) throw new InvalidOperationException("Character movement already has an owner.");
            Stop();
            _movementOwner = owner;
        }

        public void SetOwnedMovementInput(object owner, Vector2 input, float maxSpeed)
        {
            RequireMovementOwner(owner);
            _movementInput = input;
            _maxSpeed = maxSpeed;
        }

        /// <summary>Stops the actor and gives ordinary movement control back.</summary>
        public void ReleaseMovement(object owner)
        {
            RequireMovementOwner(owner);
            Stop();
            _movementOwner = null;
        }

        private void RequireMovementOwner(object owner)
        {
            if (owner == null) throw new ArgumentNullException(nameof(owner));
            if (!ReferenceEquals(owner, _movementOwner))
                throw new InvalidOperationException("Only the current movement owner can drive or release the actor.");
        }

        void FixedUpdate()
        {
            Vector2 target = _movementInput.normalized * _maxSpeed;
            float rate = _movementInput.sqrMagnitude > 0.01f ? _acceleration : _deceleration;
            _rb.linearVelocity = Vector2.MoveTowards(_rb.linearVelocity, target, rate * Time.fixedDeltaTime);

            if (_rb.linearVelocity.sqrMagnitude > 0.01f)
                CurrentDirection = _rb.linearVelocity.normalized;
        }

        /// <summary>Stops all movement, including owned movement, without releasing its owner.</summary>
        public void Stop()
        {
            _movementInput = Vector2.zero;
            _rb.linearVelocity = Vector2.zero;
        }

        public void ApplyImpulse(Vector2 force) => _rb.AddForce(force, ForceMode2D.Impulse);
    }
}

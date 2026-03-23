using System;
using UnityEngine;

namespace Character
{
    /// <summary>
    /// Tracks the character's facing direction, decoupled from raw velocity.
    /// Abilities call UpdateFromVelocity each frame; spawn code calls ForceDirection.
    /// </summary>
    public class Orientation2D : MonoBehaviour
    {
        public Vector2 FacingDirection { get; private set; } = Vector2.down;

        public event Action<Vector2> OnFacingDirectionChanged;

        /// <summary>
        /// Called by MovementAbility. Updates facing direction only when the character is moving.
        /// </summary>
        public void UpdateFromVelocity(Vector2 velocity)
        {
            if (velocity.sqrMagnitude < 0.01f) return;
            SetDirection(velocity.normalized);
        }

        /// <summary>
        /// Immediately forces a facing direction (used on spawn/warp).
        /// </summary>
        public void ForceDirection(Vector2 direction)
        {
            if (direction.sqrMagnitude < 0.01f) return;
            SetDirection(direction.normalized);
        }

        void SetDirection(Vector2 dir)
        {
            if (dir == FacingDirection) return;
            FacingDirection = dir;
            OnFacingDirectionChanged?.Invoke(dir);
        }
    }
}

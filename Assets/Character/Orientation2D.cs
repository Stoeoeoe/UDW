using System;
using UnityEngine;

namespace Character
{
    /// <summary>
    /// Tracks the character's facing direction, decoupled from raw velocity.
    /// Movement input determines facing even when a collision prevents motion; spawn code calls ForceDirection.
    /// </summary>
    public class Orientation2D : MonoBehaviour
    {
        public Vector2 FacingDirection { get; private set; } = Vector2.down;

        public event Action<Vector2> OnFacingDirectionChanged;

        /// <summary>
        /// Nonzero movement intent updates facing; releasing input preserves the last direction.
        /// </summary>
        public void UpdateFromInput(Vector2 input)
        {
            if (input.sqrMagnitude < 0.01f) return;
            SetDirection(input.normalized);
        }

        /// <summary>
        /// Immediately forces a facing direction (used on spawn/warp).
        /// </summary>
        public void ForceDirection(Vector2 direction)
        {
            if (direction.sqrMagnitude < 0.01f) return;
            SetDirection(direction.normalized);
        }

        /// <summary>Turns toward a world position without moving the character.</summary>
        public void FaceTowards(Vector2 worldPosition)
        {
            if (!float.IsFinite(worldPosition.x) || !float.IsFinite(worldPosition.y))
                throw new ArgumentException("Facing requires a finite target position.", nameof(worldPosition));
            var direction = (worldPosition - (Vector2)transform.position).normalized;
            if (direction == Vector2.zero)
                throw new InvalidOperationException("The target is too close to determine a facing direction.");
            ForceDirection(direction);
        }

        void SetDirection(Vector2 dir)
        {
            if (dir == FacingDirection) return;
            FacingDirection = dir;
            OnFacingDirectionChanged?.Invoke(dir);
        }
    }
}

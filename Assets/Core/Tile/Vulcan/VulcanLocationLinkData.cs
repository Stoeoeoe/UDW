using System;
using UnityEngine;

namespace Core.Tile.Vulcanus
{
    [Serializable]
    public struct VulcanusLocationLinkData
    {
        public string id;
        public string label;
        public Vector2 sourcePosition; // absolute pixels
        public Vector2 triggerSize; // pixels
        public string targetMapId;
        public Vector2 targetPosition; // absolute pixels
        // Explicit exit facing coming from source map JSON (optional)
        public Vector2 targetFacing;
        public bool hasTargetFacing;
        public string targetLinkId;
        public string direction;

        public Vector2 SuggestedExitFacingDirection
        {
            get
            {
                if (hasTargetFacing && targetFacing != Vector2.zero)
                    return targetFacing.normalized;

                if (!string.IsNullOrWhiteSpace(direction))
                {
                    if (direction.Equals("up", StringComparison.OrdinalIgnoreCase) ||
                        direction.Equals("north", StringComparison.OrdinalIgnoreCase))
                        return Vector2.up;

                    if (direction.Equals("down", StringComparison.OrdinalIgnoreCase) ||
                        direction.Equals("south", StringComparison.OrdinalIgnoreCase))
                        return Vector2.down;

                    if (direction.Equals("left", StringComparison.OrdinalIgnoreCase) ||
                        direction.Equals("west", StringComparison.OrdinalIgnoreCase))
                        return Vector2.left;

                    if (direction.Equals("right", StringComparison.OrdinalIgnoreCase) ||
                        direction.Equals("east", StringComparison.OrdinalIgnoreCase))
                        return Vector2.right;
                }

                if (targetPosition == Vector2.zero || targetPosition == sourcePosition)
                    return Vector2.zero;

                var delta = targetPosition - sourcePosition;
                if (Mathf.Abs(delta.x) >= Mathf.Abs(delta.y))
                    return delta.x >= 0 ? Vector2.right : Vector2.left;

                return delta.y >= 0 ? Vector2.up : Vector2.down;
            }
        }
    }
}

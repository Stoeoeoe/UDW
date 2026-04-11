using System;
using UnityEngine;

namespace Core.Tile.Vulcan
{
    [Serializable]
    public struct VulcanLocationLinkData
    {
        public string id;
        public string label;
        public Vector2Int sourcePosition;
        public Vector2Int triggerSize;
        public string targetMapId;
        public Vector2Int targetPosition;
        public string targetLinkId;
        public string direction;

        public Vector2 SuggestedExitFacingDirection
        {
            get
            {
                var delta = targetPosition - sourcePosition;
                if (Mathf.Abs(delta.x) >= Mathf.Abs(delta.y))
                    return delta.x >= 0 ? Vector2.right : Vector2.left;

                return delta.y >= 0 ? Vector2.up : Vector2.down;
            }
        }
    }
}

using System;
using PixelCrushers;
using UnityEngine;

namespace Core.Tile.Vulcanus
{
    public class VulcanusMapAnchor : MonoBehaviour
    {
        [SerializeField] private string anchorId;
        [SerializeField] private string anchorName;
        [SerializeField] private Vector2 facingDirection = Vector2.zero;
        [SerializeField] private string[] tags = Array.Empty<string>();

        public string AnchorId => anchorId;
        public string AnchorName => anchorName;
        public Vector2 FacingDirection => facingDirection;
        public string[] Tags => tags;

        public void Configure(string id, string displayName, Vector2 facing, string[] anchorTags)
        {
            anchorId = id ?? string.Empty;
            anchorName = string.IsNullOrWhiteSpace(displayName) ? anchorId : displayName;
            facingDirection = facing;
            tags = anchorTags ?? Array.Empty<string>();
        }

        private void OnDrawGizmos()
        {
            Gizmos.color = Color.green;
            Gizmos.DrawIcon(transform.position, "sv_icon_dot3_pix16_gizmo", true);
            Gizmos.DrawWireSphere(transform.position, 0.2f);

            if (facingDirection == Vector2.zero)
                return;

            MoreGizmos.DrawArrow(transform.position + (Vector3)(facingDirection.normalized * 0.5f), facingDirection.normalized, 0.25f);
        }
    }
}
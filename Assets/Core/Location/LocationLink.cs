using Character;
using Core.Tile.Vulcan;
using EditorUI.Attributes;
using PixelCrushers;
using UnityEngine;

namespace Core.Location
{
    /// <summary>
    /// Portal/door to another location. Calls LevelManager.Instance.LoadLocation.
    /// Door = walk-in (button press needed). Open = no button press required.
    /// </summary>
    public class LocationLink : ILocationLink
    {
        [SerializeField] private LocationData targetLocation;
        [SerializeField] private string targetLocationId;
        [SerializeField] private string targetEntryKey;
        [SerializeField] private LocationLinkType linkType;
        [Dial(45)] [SerializeField] private Vector2 previewFacingDirection;

        public LocationData TargetLocation  => targetLocation;
        public string TargetLocationId => targetLocationId;
        public string TargetEntryKey => targetEntryKey;

        public override bool RequiresButtonPress => linkType == LocationLinkType.Door;

        private void OnValidate()
        {
            if (previewFacingDirection != Vector2.zero)
                exitFacingDirection = previewFacingDirection;
        }

        public override void ApplyVulcanData(VulcanLocationLinkData data, VulcanWorldCatalog catalog)
        {
            Key = data.id;
            targetLocationId = data.targetMapId;
            targetEntryKey = string.IsNullOrWhiteSpace(data.targetLinkId)
                ? data.targetMapId
                : data.targetLinkId;

            if (catalog != null && catalog.TryGetLocationDataByMapId(data.targetMapId, out var mappedLocation))
                targetLocation = mappedLocation;

            var suggestedFacing = data.SuggestedExitFacingDirection;
            if (suggestedFacing != Vector2.zero)
            {
                exitFacingDirection = suggestedFacing;
                previewFacingDirection = suggestedFacing;
            }
        }


        protected override void Interact(GameCharacter instigator)
        {
            var resolvedTarget = targetLocation;
            if (!resolvedTarget && !string.IsNullOrWhiteSpace(targetLocationId))
                resolvedTarget = LevelManager.Instance.GetLocationDataById(targetLocationId);

            if (!resolvedTarget)
            {
                Debug.LogWarning($"[LocationLink] {gameObject.name} has no target LocationData assigned.");
                return;
            }

            var entryKey = string.IsNullOrWhiteSpace(targetEntryKey)
                ? targetLocationId
                : targetEntryKey;

            LevelManager.Instance.LoadLocation(resolvedTarget, entryKey, instigator.Orientation.FacingDirection);
        }

        private void OnDrawGizmos()
        {
            Gizmos.color = Color.green;
            var facing = previewFacingDirection != Vector2.zero ? previewFacingDirection : exitFacingDirection;
            var position = transform.position + (Vector3)(facing.normalized * 0.5f);
            MoreGizmos.DrawArrow(position, facing.normalized, 0.25f);
        }
    }
}
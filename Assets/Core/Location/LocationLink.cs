using Character;
using Core.Tile.Vulcanus;
using PixelCrushers;
using System;
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

        public LocationData TargetLocation  => targetLocation;
        public string TargetLocationId => targetLocationId;
        public string TargetEntryKey => targetEntryKey;

        public override bool RequiresButtonPress => linkType == LocationLinkType.Door;

        public override void ApplyVulcanusData(VulcanusLocationLinkData data, VulcanusWorldCatalog catalog)
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
                exitFacingDirection = suggestedFacing;
        }


        protected override void Interact(GameCharacter instigator)
        {
            var levelManager = LevelManager.Instance;
            if (!levelManager)
            {
                Debug.LogWarning($"[LocationLink] {gameObject.name} has no LevelManager available.");
                return;
            }

            var entryKey = string.IsNullOrWhiteSpace(targetEntryKey)
                ? targetLocationId
                : targetEntryKey;
            var transitionFacing = exitFacingDirection != Vector2.zero ? exitFacingDirection : instigator.Orientation.FacingDirection;

            if (TargetsCurrentLocation(levelManager))
            {
                if (!levelManager.TransitionWithinCurrentLocation(entryKey, transitionFacing))
                    Debug.LogWarning($"[LocationLink] {gameObject.name} could not resolve local target '{entryKey}'.");
                return;
            }

            var resolvedTarget = targetLocation;
            if (!resolvedTarget && !string.IsNullOrWhiteSpace(targetLocationId))
                resolvedTarget = levelManager.GetLocationDataById(targetLocationId);

            if (!resolvedTarget)
            {
                Debug.LogWarning($"[LocationLink] {gameObject.name} could not resolve target location '{targetLocationId}'.");
                return;
            }

            levelManager.LoadLocation(resolvedTarget, entryKey, transitionFacing);
        }

        private bool TargetsCurrentLocation(LevelManager levelManager)
        {
            var currentLocation = levelManager.CurrentLocationData;
            if (currentLocation == null)
                return false;

            if (targetLocation != null)
                return targetLocation == currentLocation;

            return string.IsNullOrWhiteSpace(targetLocationId) ||
                   string.Equals(targetLocationId, currentLocation.id, StringComparison.OrdinalIgnoreCase);
        }

        private void OnDrawGizmos()
        {
            Gizmos.color = Color.green;
            var facing = exitFacingDirection;
            if (facing == Vector2.zero)
                return;

            var position = transform.position + (Vector3)(facing.normalized * 0.5f);
            MoreGizmos.DrawArrow(position, facing.normalized, 0.25f);
        }
    }
}
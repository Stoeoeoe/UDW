using System;
using Character;
using Core.Tile.Vulcanus;
using MoreMountains.Tools;
using UnityEngine;

namespace Core.Location
{
    /// <summary>
    /// Portal/door to another location. Routes through the injected LevelManager.
    /// Door requires a button press. Open activates on player contact.
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
            linkType = data.linkType;
            targetLocationId = data.targetMapId;
            targetEntryKey = data.targetLinkId;

            if (catalog != null && catalog.TryGetLocationDataByMapId(data.targetMapId, out var mappedLocation))
                targetLocation = mappedLocation;

            var suggestedFacing = data.SuggestedExitFacingDirection;
            if (suggestedFacing != Vector2.zero)
                exitFacingDirection = suggestedFacing;
        }


        protected override bool Interact(GameCharacter instigator)
        {
            if (instigator != _characterManager.MainCharacter) return false;
            var levelManager = _levelManager;

            var entryKey = targetEntryKey;
            if (string.IsNullOrWhiteSpace(entryKey))
                throw new InvalidOperationException($"Location link '{Key}' requires an arrival anchor.");
            var transitionFacing = exitFacingDirection != Vector2.zero ? exitFacingDirection : instigator.Orientation.FacingDirection;

            if (TargetsCurrentLocation(levelManager))
            {
                var transitioned = levelManager.TransitionWithinCurrentLocation(entryKey, transitionFacing);
                if (!transitioned)
                    Debug.LogWarning($"[LocationLink] {gameObject.name} could not resolve local target '{entryKey}'.");
                return transitioned;
            }

            var resolvedTarget = targetLocation;
            if (!resolvedTarget && !string.IsNullOrWhiteSpace(targetLocationId))
                resolvedTarget = levelManager.GetLocationDataById(targetLocationId);

            if (!resolvedTarget)
            {
                Debug.LogWarning($"[LocationLink] {gameObject.name} could not resolve target location '{targetLocationId}'.");
                return false;
            }

            return levelManager.LoadLocation(resolvedTarget, entryKey, transitionFacing);
        }

        private bool TargetsCurrentLocation(LevelManager levelManager)
        {
            var currentLocation = levelManager.CurrentLocationData;
            if (currentLocation == null)
                return false;

            if (targetLocation != null)
                return targetLocation == currentLocation;

            return string.IsNullOrWhiteSpace(targetLocationId) ||
                   targetLocationId == currentLocation.id;
        }

        private void OnDrawGizmos()
        {
            Gizmos.color = Color.green;
            var facing = exitFacingDirection;
            if (facing == Vector2.zero)
                return;

            var position = transform.position + (Vector3)(facing.normalized * 0.5f);
            MMDebug.DrawGizmoArrow(position, facing.normalized * 0.25f, Color.green, 0.08f);
        }
    }
}

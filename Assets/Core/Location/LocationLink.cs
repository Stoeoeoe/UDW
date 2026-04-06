using System;
using Character;
using EditorUI.Attributes;
using Interaction;
using PixelCrushers;
using UnityEngine;
using UnityEngine.Serialization;

namespace Core.Location
{
    /// <summary>
    /// Portal/door to another location. Calls LevelManager.Instance.LoadLocation.
    /// Door = walk-in (button press needed). Open = no button press required.
    /// </summary>
    public class LocationLink : AbstractInteractable
    {
        [SerializeField] private LocationData targetLocation;
        [SerializeField] private string targetEntryKey;
        [SerializeField] private LocationLinkType linkType;
        [Dial(45)][SerializeField] public Vector2 exitFacingDirection;
        [SerializeField] private float exitSpawnOffset = 0.8f;

        /// <summary>Key identifying this link in the current scene (used as the destination entry key elsewhere).</summary>
        [field: SerializeField]
        public string Key { get; private set; }

        public LocationData TargetLocation  => targetLocation;
        public Vector3      ExitSpawnOffset => exitFacingDirection.normalized * exitSpawnOffset;
        
        public override bool RequiresButtonPress => linkType == LocationLinkType.Door;


        protected override void Interact(GameCharacter instigator)
        {
            if (!targetLocation)
            {
                Debug.LogWarning($"[LocationLink] {gameObject.name} has no target LocationData assigned.");
                return;
            }

            LevelManager.Instance.LoadLocation(targetLocation, targetEntryKey, instigator.Orientation.FacingDirection);
        }

        private void OnDrawGizmos()
        {
            Gizmos.color = Color.green;
            var position = transform.position + (Vector3)(exitFacingDirection.normalized * 0.5f);
            MoreGizmos.DrawArrow(position, exitFacingDirection.normalized, 0.25f);
        }
    }
}
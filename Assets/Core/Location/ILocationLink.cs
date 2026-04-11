using Core.Tile.Vulcan;
using Interaction;
using UnityEngine;

namespace Core.Location
{
    public abstract class ILocationLink : AbstractInteractable
    {
        [field: SerializeField]
        public string Key { get; protected set; }

        [SerializeField] protected Vector2 exitFacingDirection = Vector2.down;
        [SerializeField] protected float exitSpawnOffset = 0.8f;

        public Vector2 ExitFacingDirection => exitFacingDirection;
        public Vector3 ExitSpawnOffset => exitFacingDirection.normalized * exitSpawnOffset;

        public abstract void ApplyVulcanData(VulcanLocationLinkData data, VulcanWorldCatalog catalog);
    }
}

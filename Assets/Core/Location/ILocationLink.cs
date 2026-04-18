using Core.Tile.Vulcanus;
using Interaction;
using UnityEngine;

namespace Core.Location
{
    public abstract class ILocationLink : AbstractInteractable
    {
        [field: SerializeField]
        public string Key { get; protected set; }

        [SerializeField] protected Vector2 exitFacingDirection = Vector2.down;

        public Vector2 ExitFacingDirection => exitFacingDirection;

        public abstract void ApplyVulcanusData(VulcanusLocationLinkData data, VulcanusWorldCatalog catalog);
    }
}

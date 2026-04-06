using Core.Tile;
using Items;
using UnityEngine;

namespace Core.Items
{
    public abstract class PlaceableItem : EquippableItem
    {
        [SerializeField] protected TerrainType[] placeableOnTerrainTypes;

        public TerrainType[] PlaceableOnTerrainTypes => placeableOnTerrainTypes;

        public virtual GameObject GetPlaceableRepresentation() => null;
    }

}
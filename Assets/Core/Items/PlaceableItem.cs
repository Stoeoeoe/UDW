using Core.Tile;
using Items;
using UnityEngine;

namespace Core.Items
{
    public abstract class PlaceableItem : EquippableItem
    {
        [field: SerializeField] public TerrainType[] PlaceableOnTerrainTypes { get; private set; }

        public virtual GameObject GetPlaceableRepresentation() => null;
    }

}

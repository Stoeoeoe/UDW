using Core.Tile;
using Items;
using SuperTiled2Unity;
using UnityEngine;

namespace Core.Items
{
    public abstract class PlaceableItem : EquippableItem
    {
        [SerializeField] protected TerrainType[] placeableOnTerrainTypes;

        private void OnValidate()
        {

        }

        private void Awake()
        {
            // Actively overwrite to prevent mistakes. TODO: Do through custom editor.
            this.Usable = true;
            this.Droppable = true;
            this.Consumable = true;
            this.TargetInventoryName = "MainInventory"; // TODO: Make global constant
            this.ForcePrefabDropQuantity = true;
            this.PrefabDropQuantity = 1;            
        }

        public virtual GameObject GetPlaceableRepresentation()
        {
            return this.Prefab;
        }

        public override GameObject SpawnPrefab(string playerID)
        { 
            // Spawn is taken care of by MapManager, not Spawn function
            return null;
        }
    }

}
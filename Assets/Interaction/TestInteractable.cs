using Character;
using Core.Tile;
using UnityEngine;

namespace Interaction
{
    public class TestInteractable : BasicInteractable
    {
        public bool IsPlowingAllFields;
        public bool IsIrrigatingSomeFields;

        protected override void Interact(UrCharacter instigator)
        {
            Debug.Log($"{instigator.name} interacted with {name} at {Time.time}");
            PlowFields();
        }

        private void PlowFields()
        {
            var allFarmLand = MapManager.Current.GetTileDataForTerrainType(TerrainType.FarmLand);
            foreach (var tileData in allFarmLand)
            {
                if (IsPlowingAllFields)
                {
                    MapManager.Current.PlowTile(tileData);
                    if (IsIrrigatingSomeFields)
                    {
                        MapManager.Current.DryTile(tileData);
                        if (Random.value > 0.5f) continue;
                    
                        MapManager.Current.IrrigateTile(tileData);
                    }
                }

            }
        }
    }
}
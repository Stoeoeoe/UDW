using Character;
using Core.Tile;
using UnityEngine;

namespace Interaction
{
    public class TestInteractable : AbstractInteractable
    {
        public bool IsPlowingAllFields;
        public bool IsIrrigatingSomeFields;

        protected override void Interact(GameCharacter instigator)
        {
            Debug.Log($"{instigator.name} interacted with {name} at {Time.time}");
            PlowFields();
        }

        private void PlowFields()
        {
            // var allFarmLand = MapManager.Instance.GetTileDataForTerrainType(TerrainType.FarmLand);
            // foreach (var tileData in allFarmLand)
            // {
            //     if (IsPlowingAllFields)
            //     {
            //         MapManager.Instance.PlowTile(tileData);
            //         if (IsIrrigatingSomeFields)
            //         {
            //             MapManager.Instance.DryTile(tileData);
            //             if (Random.value > 0.5f) continue;
            //         
            //             MapManager.Instance.IrrigateTile(tileData);
            //         }
            //     }
            //
            // }
        }
    }
}

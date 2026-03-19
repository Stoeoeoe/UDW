using Core.Tile;
using UnityEngine;

namespace Test
{
    public class TestScript : MonoBehaviour
    {
        private void PlowFields()
        {
            var allFarmLand = MapManager.Current.GetTileDataForTerrainType(TerrainType.FarmLand);
            foreach (var tileData in allFarmLand)
            {
                MapManager.Current.PlowTile(tileData);
            }

        }
    }
}
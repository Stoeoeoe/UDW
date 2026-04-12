using UnityEngine;
using UnityEngine.Serialization;

namespace Core.Tile
{
    [CreateAssetMenu(fileName = "Tile Data", menuName = "Game/TileData", order = 0)]
    public class TerrainData : ScriptableObject
    {
        [SerializeField] private TerrainType terrainType;
        public TerrainType TerrainType => terrainType;

        [SerializeField] private SurfaceSound surfaceSound;
        public SurfaceSound SurfaceSound => surfaceSound;
    }
}
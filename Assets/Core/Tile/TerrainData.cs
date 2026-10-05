using UnityEngine;
using UnityEngine.Serialization;

namespace Core.Tile
{
    [CreateAssetMenu(fileName = "Terrain Data", menuName = "Game/World/Terrain", order = 0)]
    public class TerrainData : ScriptableObject
    {
        [SerializeField] private TerrainType terrainType;
        public TerrainType TerrainType => terrainType;

        [SerializeField] private SurfaceSound surfaceSound;
        public SurfaceSound SurfaceSound => surfaceSound;
    }
}

using System;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Core.Tile.Vulcan
{
    public enum VulcanCollisionKind
    {
        None,
        Full,
        Complex
    }

    [Serializable]
    public class VulcanTile : UnityEngine.Tilemaps.Tile
    {
        [SerializeField] private string tileId;
        [SerializeField] private int tileIndex;
        [SerializeField] private string terrainId;
        [SerializeField] private TerrainType terrainType = TerrainType.Invalid;
        [SerializeField] private string[] tags = Array.Empty<string>();
        [SerializeField] private VulcanCollisionKind collisionKind;

        public string TileId => tileId;
        public int TileIndex => tileIndex;
        public string TerrainId => terrainId;
        public TerrainType TerrainType => terrainType;
        public string[] Tags => tags;
        public VulcanCollisionKind CollisionKind => collisionKind;

        public void Configure(
            int index,
            string id,
            string terrain,
            TerrainType mappedTerrain,
            string[] tagValues,
            VulcanCollisionKind collision)
        {
            tileIndex = index;
            tileId = id;
            terrainId = terrain;
            terrainType = mappedTerrain;
            tags = tagValues ?? Array.Empty<string>();
            collisionKind = collision;
            colliderType = collision == VulcanCollisionKind.None ? UnityEngine.Tilemaps.Tile.ColliderType.None : UnityEngine.Tilemaps.Tile.ColliderType.Grid;
        }
    }
}

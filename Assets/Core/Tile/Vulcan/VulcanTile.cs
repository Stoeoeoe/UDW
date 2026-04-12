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
        public const string IsFarmablePropertyKey = "IsFarmable";
        [SerializeField] private string tileId;
        [SerializeField] private int tileIndex;
        [SerializeField] private string terrainId;
        [SerializeField] private TerrainType terrainType = TerrainType.Invalid;
        [SerializeField] private string[] tags = Array.Empty<string>();
        [SerializeField] private VulcanCollisionKind collisionKind;
        [SerializeField] private bool isFarmable;
        [Serializable]
        public class VulcanTileProperty
        {
            public string key;
            public string jsonValue;
        }

        [SerializeField] private VulcanTileProperty[] properties = Array.Empty<VulcanTileProperty>();

        public string TileId => tileId;
        public int TileIndex => tileIndex;
        public string TerrainId => terrainId;
        public TerrainType TerrainType => terrainType;
        public string[] Tags => tags;
        public VulcanCollisionKind CollisionKind => collisionKind;
        public bool IsFarmable => isFarmable;
        public VulcanTileProperty[] Properties => properties;

        public void Configure(
            int index,
            string id,
            string terrain,
            TerrainType mappedTerrain,
            string[] tagValues,
            VulcanCollisionKind collision,
            VulcanTileProperty[] metaProperties = null)
        {
            tileIndex = index;
            tileId = id;
            terrainId = terrain;
            terrainType = mappedTerrain;
            tags = tagValues ?? Array.Empty<string>();
            collisionKind = collision;
            properties = metaProperties ?? Array.Empty<VulcanTileProperty>();
            colliderType = collision == VulcanCollisionKind.None ? UnityEngine.Tilemaps.Tile.ColliderType.None : UnityEngine.Tilemaps.Tile.ColliderType.Grid;
        }

        public bool TryGetProperty(string key, out string jsonValue)
        {
            jsonValue = null;
            if (properties == null || string.IsNullOrEmpty(key))
                return false;

            for (int i = 0; i < properties.Length; i++)
            {
                var p = properties[i];
                if (p == null) continue;
                if (string.Equals(p.key, key, StringComparison.OrdinalIgnoreCase))
                {
                    jsonValue = p.jsonValue;
                    return true;
                }
            }

            return false;
        }
    }
}

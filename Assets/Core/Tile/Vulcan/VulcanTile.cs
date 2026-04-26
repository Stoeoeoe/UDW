using System;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Core.Tile.Vulcanus
{
    public enum VulcanusCollisionKind
    {
        None,
        Full,
        Complex,
        Sprite
    }

    [Serializable]
    public class VulcanusTile : UnityEngine.Tilemaps.Tile
    {
        public const string IsFarmablePropertyKey = "IsFarmable";

        [Serializable]
        public class CollisionShape
        {
            public string id;
            public string type;
            public Vector2[] points = Array.Empty<Vector2>();
            public float x;
            public float y;
            public float width;
            public float height;
        }

        [SerializeField] private string tileId;
        [SerializeField] private int tileIndex;
        [SerializeField] private string terrainId;
        [SerializeField] private TerrainType terrainType = TerrainType.Invalid;
        [SerializeField] private string[] tags = Array.Empty<string>();
        [SerializeField] private VulcanusCollisionKind collisionKind;
        [SerializeField] private bool isFarmable;
        [SerializeField] private float pivotY = 1f;
        [SerializeField] private CollisionShape[] collisionShapes = Array.Empty<CollisionShape>();

        [Serializable]
        public class VulcanusTileProperty
        {
            public string key;
            public string jsonValue;
        }

        [SerializeField] private VulcanusTileProperty[] properties = Array.Empty<VulcanusTileProperty>();

        public string TileId => tileId;
        public int TileIndex => tileIndex;
        public string TerrainId => terrainId;
        public TerrainType TerrainType => terrainType;
        public string[] Tags => tags;
        public VulcanusCollisionKind CollisionKind => collisionKind;
        public bool IsFarmable => isFarmable;
        public float PivotY => pivotY;
        public CollisionShape[] CollisionShapes => collisionShapes;
        public VulcanusTileProperty[] Properties => properties;

        public void Configure(
            int index,
            string id,
            string terrain,
            TerrainType mappedTerrain,
            string[] tagValues,
            VulcanusCollisionKind collision,
            VulcanusTileProperty[] metaProperties = null,
            float tilePivotY = 1f,
            CollisionShape[] tileCollisionShapes = null)
        {
            tileIndex = index;
            tileId = id;
            terrainId = terrain;
            terrainType = mappedTerrain;
            tags = tagValues ?? Array.Empty<string>();
            collisionKind = collision;
            properties = metaProperties ?? Array.Empty<VulcanusTileProperty>();
            pivotY = Mathf.Max(0.01f, tilePivotY);
            collisionShapes = tileCollisionShapes ?? Array.Empty<CollisionShape>();
            colliderType = collision == VulcanusCollisionKind.None ? UnityEngine.Tilemaps.Tile.ColliderType.None : UnityEngine.Tilemaps.Tile.ColliderType.Grid;
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

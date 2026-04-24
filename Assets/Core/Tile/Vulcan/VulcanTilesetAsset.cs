using System;
using UnityEngine;

namespace Core.Tile.Vulcanus
{
    [CreateAssetMenu(fileName = "VulcanusTileset", menuName = "Game/Vulcanus/Tileset")]
    public class VulcanusTilesetAsset : ScriptableObject
    {
        [Serializable]
        public class ObjectTile
        {
            public int x;
            public int y;
            public int tileIndex;
        }

        [Serializable]
        public class ObjectDefinition
        {
            public string id;
            public string name;
            public ObjectTile[] tiles;
            // Optional baked sprite representing the whole object (may be null).
            public Sprite sprite;
            // Prefab sub-asset with SpriteRenderer + merged PolygonCollider2D (may be null).
            public GameObject prefab;

            // Dimensions of the object in tiles (computed by importer).
            public int widthTiles;
            public int heightTiles;
        }

        [SerializeField] private string tilesetId;
        [SerializeField] private string displayName;
        [SerializeField] private Texture2D spriteSheet;
        [SerializeField] private int columns;
        [SerializeField] private int tileCount;
        [SerializeField] private int tileSize;
        [SerializeField] private VulcanusTile[] tiles;
        [SerializeField] private ObjectDefinition[] objectDefinitions = Array.Empty<ObjectDefinition>();

        public string TilesetId => tilesetId;
        public string DisplayName => displayName;
        public Texture2D SpriteSheet => spriteSheet;
        public int Columns => columns;
        public int TileCount => tileCount;
        public int TileSize => tileSize;
        public VulcanusTile[] Tiles => tiles;
        public ObjectDefinition[] ObjectDefinitions => objectDefinitions;

        public void Configure(
            string id,
            string name,
            Texture2D sheet,
            int setColumns,
            int count,
            int size,
            VulcanusTile[] setTiles,
            ObjectDefinition[] setObjectDefinitions = null)
        {
            tilesetId = id;
            displayName = name;
            spriteSheet = sheet;
            columns = setColumns;
            tileCount = count;
            tileSize = size;
            tiles = setTiles;
            objectDefinitions = setObjectDefinitions ?? Array.Empty<ObjectDefinition>();
        }

        public bool TryGetObjectDefinition(string defId, out ObjectDefinition def)
        {
            def = null;
            if (objectDefinitions == null || string.IsNullOrEmpty(defId)) return false;
            foreach (var d in objectDefinitions)
            {
                if (d != null && d.id == defId) { def = d; return true; }
            }
            return false;
        }

        public bool TryGetTile(int tileIndex, out VulcanusTile tile)
        {
            tile = null;

            if (tiles == null || tileIndex < 0 || tileIndex >= tiles.Length)
                return false;

            tile = tiles[tileIndex];
            return tile != null;
        }
    }
}

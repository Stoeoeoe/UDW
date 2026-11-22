using System;
using UnityEngine;

namespace Core.Tile.Vulcanus
{
    /// <summary>
    /// A Vulcanus object (*.object.json): tiles from one tileset, placed on maps as one piece. The importer bakes the
    /// tiles into one sprite and a prefab whose collider merges the tiles' collision.
    /// </summary>
    public class VulcanusObjectAsset : ScriptableObject
    {
        [Serializable]
        public class ObjectTile
        {
            /// <summary>Offset from the object's top-left cell, in tiles.</summary>
            public int x;
            public int y;
            public int tileIndex;
        }

        [SerializeField] private string objectId;
        [SerializeField] private string displayName;
        [SerializeField] private VulcanusTilesetAsset tileset;
        [SerializeField] private ObjectTile[] tiles;
        [SerializeField] private int widthTiles;
        [SerializeField] private int heightTiles;
        [SerializeField] private GameObject prefab;

        public string ObjectId => objectId;
        public string DisplayName => displayName;
        /// <summary>The tileset the tiles come from, which holds their collision and navigation cost.</summary>
        public VulcanusTilesetAsset Tileset => tileset;
        public ObjectTile[] Tiles => tiles;
        public int WidthTiles => widthTiles;
        public int HeightTiles => heightTiles;
        /// <summary>The baked prefab; null when the object has no tiles.</summary>
        public GameObject Prefab => prefab;

        public void Configure(string id, string name, VulcanusTilesetAsset source, ObjectTile[] setTiles,
            int width, int height, GameObject setPrefab)
        {
            objectId = id;
            displayName = name;
            tileset = source;
            tiles = setTiles;
            widthTiles = width;
            heightTiles = height;
            prefab = setPrefab;
        }
    }
}

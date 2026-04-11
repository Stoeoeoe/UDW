using UnityEngine;

namespace Core.Tile.Vulcan
{
    [CreateAssetMenu(fileName = "VulcanTileset", menuName = "Game/Vulcan/Tileset")]
    public class VulcanTilesetAsset : ScriptableObject
    {
        [SerializeField] private string tilesetId;
        [SerializeField] private string displayName;
        [SerializeField] private Texture2D spriteSheet;
        [SerializeField] private int columns;
        [SerializeField] private int tileCount;
        [SerializeField] private int tileSize;
        [SerializeField] private VulcanTile[] tiles;

        public string TilesetId => tilesetId;
        public string DisplayName => displayName;
        public Texture2D SpriteSheet => spriteSheet;
        public int Columns => columns;
        public int TileCount => tileCount;
        public int TileSize => tileSize;
        public VulcanTile[] Tiles => tiles;

        public void Configure(
            string id,
            string name,
            Texture2D sheet,
            int setColumns,
            int count,
            int size,
            VulcanTile[] setTiles)
        {
            tilesetId = id;
            displayName = name;
            spriteSheet = sheet;
            columns = setColumns;
            tileCount = count;
            tileSize = size;
            tiles = setTiles;
        }

        public bool TryGetTile(int tileIndex, out VulcanTile tile)
        {
            tile = null;

            if (tiles == null || tileIndex < 0 || tileIndex >= tiles.Length)
                return false;

            tile = tiles[tileIndex];
            return tile != null;
        }
    }
}

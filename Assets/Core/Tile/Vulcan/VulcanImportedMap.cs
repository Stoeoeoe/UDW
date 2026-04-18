using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Core.Tile.Vulcanus
{
    public class VulcanusImportedMap : MonoBehaviour
    {
        [System.Serializable]
        public struct TerrainCell
        {
            public int x;
            public int y;
            public string terrainId;
            public TerrainType terrainType;
        }

        [SerializeField] private string mapId;
        [SerializeField] private string mapName;
        [SerializeField] private int width;
        [SerializeField] private int height;
        [SerializeField] private int tileSize;

        [Header("Tilemaps")]
        [SerializeField] private Tilemap terrainTilemap;
        [SerializeField] private Tilemap farmlandTilemap;
        [SerializeField] private Tilemap plowedTilemap;
        [SerializeField] private Tilemap irrigatedTilemap;
        [SerializeField] private Tilemap overlayTilemap;

        [Header("Terrain")]
        [SerializeField] private TerrainCell[] terrainCells;

        private Dictionary<Vector2Int, TerrainType> _terrainByCoord;

        public string MapId => mapId;
        public string MapName => mapName;
        public int Width => width;
        public int Height => height;
        public int TileSize => tileSize;

        public Tilemap TerrainTilemap => terrainTilemap;
        public Tilemap FarmlandTilemap => farmlandTilemap;
        public Tilemap PlowedTilemap => plowedTilemap;
        public Tilemap IrrigatedTilemap => irrigatedTilemap;
        public Tilemap OverlayTilemap => overlayTilemap;

        public void Configure(string id, string displayName, int mapWidth, int mapHeight, int mapTileSize)
        {
            mapId = id;
            mapName = displayName;
            width = mapWidth;
            height = mapHeight;
            tileSize = mapTileSize;
        }

        public void SetTilemaps(
            Tilemap terrain,
            Tilemap farmland,
            Tilemap plowed,
            Tilemap irrigated,
            Tilemap overlay)
        {
            terrainTilemap = terrain;
            farmlandTilemap = farmland;
            plowedTilemap = plowed;
            irrigatedTilemap = irrigated;
            overlayTilemap = overlay;
        }

        public void SetTerrainCells(TerrainCell[] cells)
        {
            terrainCells = cells;
            _terrainByCoord = null;
        }

        public bool TryGetTerrainType(Vector2Int coordinates, out TerrainType terrainType)
        {
            BuildTerrainLookupIfNeeded();
            return _terrainByCoord.TryGetValue(coordinates, out terrainType);
        }

        private void BuildTerrainLookupIfNeeded()
        {
            if (_terrainByCoord != null)
                return;

            _terrainByCoord = new Dictionary<Vector2Int, TerrainType>();
            if (terrainCells == null)
                return;

            for (int i = 0; i < terrainCells.Length; i++)
            {
                var cell = terrainCells[i];
                _terrainByCoord[new Vector2Int(cell.x, cell.y)] = cell.terrainType;
            }
        }
    }
}

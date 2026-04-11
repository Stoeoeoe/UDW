using JetBrains.Annotations;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Core.Tile
{
    public sealed class TileData
    {
        public TileBase TilemapTile { get; }
        public Vector2Int Coordinates { get; }
        public TerrainData TerrainData { get; }
        public Vector2 WorldPosition { get; }
        [CanBeNull] public FarmlandInfo FarmlandData { get; private set; }
        
        public GameObject PlacedObject { get; set; }

        public TileData(
            TileBase tilemapTile,
            int x,
            int y,
            TerrainData terrainData,
            Vector3 worldPosition)
        {
            TilemapTile = tilemapTile;
            Coordinates = new Vector2Int(x, y);
            TerrainData = terrainData;
            WorldPosition = worldPosition;
            PlacedObject = null;
        }

        public bool CanBeFarmed => TerrainData.IsFarmable;

        public bool TryEnableFarmland()
        {
            if (!CanBeFarmed)
                return false;

            FarmlandData ??= new FarmlandInfo();
            return true;
        }

        public bool TryPlow()
        {
            if (!TryEnableFarmland())
                return false;

            FarmlandData!.Plow();
            return true;
        }

        public void TryWater()
        {
            FarmlandData?.Irrigate();
        }

        public void DryOut()
        {
            FarmlandData?.DryOut();
        }
        
        public void AddObject(GameObject obj)
        {
            PlacedObject = obj;
        }

        public override string ToString()
        {
            return $"TileData({Coordinates.x}, {Coordinates.y}) - Terrain: {TerrainData.name}";
        }
    }
}
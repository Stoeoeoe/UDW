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
        // TODO: Right now, IsFarmable and TerrainType = FarmLand are essentially the same information. We should consider consolidating them, but for now we'll keep them separate to avoid unintended consequences.
        public bool IsFarmable { get; }

        /// <summary>True when any authored map tile layer marks this cell as freshwater.</summary>
        public bool IsFreshwater { get; }

        public GameObject PlacedObject { get; set; }

        public TileData(
            TileBase tilemapTile,
            int x,
            int y,
            TerrainData terrainData,
            Vector3 worldPosition,
            bool isFarmable = false,
            bool isFreshwater = false)
        {
            TilemapTile = tilemapTile;
            Coordinates = new Vector2Int(x, y);
            TerrainData = terrainData;
            WorldPosition = worldPosition;
            PlacedObject = null;
            IsFarmable = isFarmable;
            IsFreshwater = isFreshwater;
        }

        public bool TryEnableFarmland()
        {
            if (!IsFarmable)
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

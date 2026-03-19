using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Items;
using JetBrains.Annotations;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using Plants;
using SuperTiled2Unity;
using Tools;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Tilemaps;

namespace Core.Tile
{
    public class MapManager : MMPersistentSingleton<MapManager>, MMEventListener<TopDownEngineEvent>,
        MMEventListener<SowPlantEvent>
    {
        [SerializeField] private TerrainData[] tileDataTypes;
        [SerializeField] RuleTile plowedFarmlandTile;
        [SerializeField] RuleTile irrigatedFarmlandTile;

        private const float InteractionDistance = 0.55f;

        private SuperMap _currentMap;
        private string _currentMapId;
        private Tilemap _terrainTilemap;
        private Tilemap _farmlandTilemap;
        private Tilemap _plowedTilemap;
        private Tilemap _irrigatedTilemap;

        private GameObject _plantParentGameObject;
        private Dictionary<TerrainType, TerrainData> _terrainDataByType;
        private Dictionary<Vector2Int, TileData> _tileDataCache;

        // TODO: Rework
        public Dictionary<Vector2Int, PlaceableItem> Items = new();
        public Tilemap OverlayTilemap { get; private set; }

        #region Initialization

        protected override void Awake()
        {
            base.Awake();
            _terrainDataByType = tileDataTypes.ToDictionary(td => td.TerrainType, td => td);
            InitializePlantContainer();
        }

        private void InitializePlantContainer()
        {
            _plantParentGameObject = new GameObject("Plants")
            {
                transform = { parent = transform }
            };
            var sortingGroup = _plantParentGameObject.AddComponent<SortingGroup>();
            sortingGroup.sortingLayerName = "Plants";
            sortingGroup.sortingOrder = 1;
        }

        protected void OnEnable()
        {
            this.MMEventStartListening<SowPlantEvent>();
            this.MMEventStartListening<TopDownEngineEvent>();
        }

        protected void OnDisable()
        {
            this.MMEventStopListening<SowPlantEvent>();
            this.MMEventStopListening<TopDownEngineEvent>();
        }

        #endregion

        #region Tile Queries

        [CanBeNull]
        public TileData GetTileDataBelowCharacter(UrCharacter character)
        {
            return GetTileDataAtCoordinates(GetCurrentTileCoordinates(character));
        }

        [CanBeNull]
        public TileData GetTileDataInDirectionOfCharacter(UrCharacter character, Vector2 direction)
        {
            var origin = GetInteractionOriginTile(character);
            var target = origin + Vector2Int.RoundToInt(direction);
            return GetTileDataAtCoordinates(target);
        }

        [CanBeNull]
        public TileData GetTileDataAtCoordinates(Vector2Int coordinates)
        {
            return _tileDataCache.GetValueOrDefault(coordinates);
        }

        public TileData GetTileDataAtWorldPosition(Vector2 worldPosition)
        {
            var cellPosition = _terrainTilemap.WorldToCell(worldPosition);
            return GetTileDataAtCoordinates(new Vector2Int(cellPosition.x, cellPosition.y));
        }

        public List<TileData> GetTileDataAround(UrCharacter character, Vector2Int[] relativeTiles)
        {
            var currentCoordinates = GetCurrentTileCoordinates(character);
            return relativeTiles
                .Select(offset => GetTileDataAtCoordinates(currentCoordinates + offset))
                .Where(tile => tile != null)
                .ToList();
        }

        public List<TileData> GetTileDataForTerrainType(TerrainType terrainType)
        {
            return _tileDataCache.Values
                .Where(td => td.TerrainData.TerrainType == terrainType)
                .ToList();
        }

        public bool IsTileOccupied(TileData tileData)
        {
            if (tileData == null) return true;

            // Check for physics collisions
            var colliders = Physics2D.OverlapBox(tileData.WorldPosition, new Vector2(1, 1), 0);
            if (colliders != null && colliders.shapeCount > 0)
                return true;

            // Check for plants
            if (PlantManager.Current.HasPlantAtCurrentMap(tileData.Coordinates))
                return true;

            // TODO: Also check for other items placed on the tile...
            return false;
        }

        public bool IsTileAtCoordinatesOccupied(Vector2Int coordinates)
        {
            return IsTileOccupied(GetTileDataAtCoordinates(coordinates));
        }

        public bool IsTileWithinRadius(TileData sourceTile, TileData targetTile, int radius)
        {
            return Vector2Int.Distance(sourceTile.Coordinates, targetTile.Coordinates) <= radius;
        }

        public bool IsTileWithinRadiusOfCharacter(UrCharacter character, TileData targetTile, int radius)
        {
            return IsTileWithinRadius(character.CurrentTileData, targetTile, radius);
        }

        #endregion

        #region Coordinate Conversions

        public Vector2Int GetCurrentTileCoordinates(UrCharacter character)
        {
            var worldPosition = character.ToolInteractionAnchor.position;
            var cellPosition = _terrainTilemap.WorldToCell(worldPosition);
            return new Vector2Int(cellPosition.x, cellPosition.y);
        }

        public Vector2Int GetCurrentMainCharacterTileCoordinates()
        {
            var worldPosition = MainCharacter.CurrentMainCharacter.transform.position;
            var cellPosition = _terrainTilemap.WorldToCell(worldPosition);
            return new Vector2Int(cellPosition.x, cellPosition.y);
        }

        public Vector2Int GetInteractionOriginTile(UrCharacter character)
        {
            var forward = FacingToVector(character.Orientation2D.CurrentFacingDirection);
            var probeWorldPosition = (Vector2)character.ToolInteractionAnchor.position + forward * InteractionDistance;
            var cell = _terrainTilemap.WorldToCell(probeWorldPosition);
            return new Vector2Int(cell.x, cell.y);
        }

        public Vector2Int GetTileCoordinatesInDirection(UrCharacter character, Vector2 direction)
        {
            var currentCoordinates = GetCurrentTileCoordinates(character);
            return currentCoordinates + new Vector2Int((int)direction.x, (int)direction.y);
        }

        private Vector3 GetWorldPositionFromTileCoordinates(Vector2Int coordinates)
        {
            var cellPosition = new Vector3Int(coordinates.x, coordinates.y, 0);
            return _terrainTilemap.CellToWorld(cellPosition) + _terrainTilemap.cellSize / 2;
        }

        private static Vector2 FacingToVector(MoreMountains.TopDownEngine.Character.FacingDirections facing)
        {
            return facing switch
            {
                MoreMountains.TopDownEngine.Character.FacingDirections.North => Vector2.up,
                MoreMountains.TopDownEngine.Character.FacingDirections.South => Vector2.down,
                MoreMountains.TopDownEngine.Character.FacingDirections.East => Vector2.right,
                MoreMountains.TopDownEngine.Character.FacingDirections.West => Vector2.left,
                _ => Vector2.zero
            };
        }

        #endregion

        #region Tile Modifications

        public void PlowTile(TileData tile)
        {
            if (tile?.TerrainData.TerrainType != TerrainType.FarmLand) return;
            tile.FarmlandData?.Plow();
            SetTileAt(_plowedTilemap, tile.Coordinates, plowedFarmlandTile);
        }

        public void UnplowTile(TileData tile)
        {
            if (tile?.TerrainData.TerrainType != TerrainType.FarmLand) return;
            tile.FarmlandData?.Unplow();
            SetTileAt(_plowedTilemap, tile.Coordinates, null);
        }

        public void IrrigateTile(TileData tile)
        {
            if (tile?.TerrainData.TerrainType != TerrainType.FarmLand) return;
            tile.FarmlandData?.Irrigate();
            SetTileAt(_irrigatedTilemap, tile.Coordinates, irrigatedFarmlandTile);
        }

        public void DryTile(TileData tile)
        {
            if (tile?.TerrainData.TerrainType != TerrainType.FarmLand) return;
            tile.DryOut();
            SetTileAt(_irrigatedTilemap, tile.Coordinates, null);
        }

        public bool IsFarmLand(int x, int y)
        {
            var tile = GetTileDataAtCoordinates(new Vector2Int(x, y));
            return tile?.TerrainData.TerrainType == TerrainType.FarmLand;
        }

        private void SetTileAt(Tilemap tilemap, Vector2Int coordinates, TileBase tile)
        {
            tilemap?.SetTile(new Vector3Int(coordinates.x, coordinates.y, 0), tile);
        }

        #endregion

        #region Tool Effect Configuration

        public List<TileData> GetTilesFromEffectConfiguration(UrCharacter character, ToolEffectConfiguration config)
        {
            if (config?.AffectedTileOffsets == null)
                return new List<TileData>();

            var originCoordinates = character.CurrentTileCoordinates;
            var facing = character.Orientation2D.CurrentFacingDirection;

            return config.AffectedTileOffsets
                .Select(offset => RotateOffset(offset, facing))
                .Select(rotated => GetTileDataAtCoordinates(originCoordinates + rotated))
                .Where(tile => tile != null)
                .ToList();
        }

        private static Vector2Int RotateOffset(Vector2Int offset,
            MoreMountains.TopDownEngine.Character.FacingDirections facing)
        {
            return facing switch
            {
                MoreMountains.TopDownEngine.Character.FacingDirections.East => new Vector2Int(offset.y, -offset.x),
                MoreMountains.TopDownEngine.Character.FacingDirections.South => new Vector2Int(-offset.x, -offset.y),
                MoreMountains.TopDownEngine.Character.FacingDirections.West => new Vector2Int(-offset.y, offset.x),
                _ => offset // North or default
            };
        }

        #endregion

        #region Map Initialization

        public void OnMMEvent(TopDownEngineEvent engineEvent)
        {
            if (engineEvent.EventType == TopDownEngineEventTypes.LevelEnd)
            {
                _currentMapId = null;
                _currentMap = null;
                _tileDataCache = null;
                return;
            }
            
        if (engineEvent.EventType == TopDownEngineEventTypes.SpawnComplete)
        InitializeMap();
    }

    public void OnMMEvent(SowPlantEvent sowPlantEvent)
    {
        var tileData = GetTileDataAtCoordinates(sowPlantEvent.Position);
        if (tileData == null)
            throw new Exception($"Missing tile data for sowing plant at {sowPlantEvent.Position}");

        // Assume growth stage 0 for newly sowed plants
        var plantRepresentation = PlantManager.Current.PlantData[sowPlantEvent.PlantId]
            .growthStages[0].representation;
        var instance = plantRepresentation.CreateInstance(_plantParentGameObject.transform);
        instance.transform.position = tileData.WorldPosition;
    }

    private void InitializeMap()
    {
        LoadTilemapReferences();
        BuildTileDataCache();
    }

    private void LoadTilemapReferences()
    {
        var superMapTransform = FindFirstObjectByType<SuperMap>().transform;

        _terrainTilemap = FindTilemap(superMapTransform, "Terrain");
        _farmlandTilemap = FindTilemap(superMapTransform, "FarmLand");
        _plowedTilemap = FindTilemap(superMapTransform, "FarmLand_Plowed");
        _irrigatedTilemap = FindTilemap(superMapTransform, "FarmLand_Irrigated");
        OverlayTilemap = FindTilemap(superMapTransform, "Overlay");
    }

    private static Tilemap FindTilemap(Transform parent, string name)
    {
        return parent.MMFindDeepChildDepthFirst(name)?.GetComponent<Tilemap>();
    }

    private void BuildTileDataCache()
    {
        _tileDataCache = new Dictionary<Vector2Int, TileData>();
        var bounds = _terrainTilemap.cellBounds;

        // First pass: terrain tiles
        ProcessTilemap(_terrainTilemap, bounds, ProcessTerrainTile);

        // Second pass: farmland overlay (if present)
        if (_farmlandTilemap != null)
            ProcessTilemap(_farmlandTilemap, bounds, ProcessFarmlandTile);
    }

    private void ProcessTilemap(Tilemap tilemap, BoundsInt bounds, Action<Vector2Int, SuperTile> processor)
    {
        for (int x = bounds.xMin; x < bounds.xMax; x++)
        {
            for (int y = bounds.yMin; y < bounds.yMax; y++)
            {
                var cellPosition = new Vector3Int(x, y, 0);
                if (tilemap.GetTile(cellPosition) is SuperTile superTile)
                {
                    processor(new Vector2Int(x, y), superTile);
                }
            }
        }
    }

    private void ProcessTerrainTile(Vector2Int coordinates, SuperTile superTile)
    {
        var terrainType = superTile.GetPropertyValueAsEnum<TerrainType>("terrain_type");
        if (!_terrainDataByType.TryGetValue(terrainType, out var terrainData))
            return;

        var worldPosition = GetWorldPositionFromTileCoordinates(coordinates);
        var tileData = new TileData(superTile, coordinates.x, coordinates.y, terrainData, worldPosition);

        if (terrainType == TerrainType.FarmLand)
            tileData.TryEnableFarmland();

        _tileDataCache[coordinates] = tileData;
    }

    private void ProcessFarmlandTile(Vector2Int coordinates, SuperTile superTile)
    {
        var terrainType = superTile.GetPropertyValueAsEnum<TerrainType>("terrain_type");
        if (terrainType != TerrainType.FarmLand) return;

        var worldPosition = GetWorldPositionFromTileCoordinates(coordinates);
        var tileData = new TileData(superTile, coordinates.x, coordinates.y,
            _terrainDataByType[TerrainType.FarmLand], worldPosition);
        tileData.TryEnableFarmland();
        _tileDataCache[coordinates] = tileData;
    }

    #endregion
}

}
using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Events;
using Core.Items;
using Core.Location;
using JetBrains.Annotations;
using MoreMountains.Tools;
using Plants;
using SuperTiled2Unity;
using Tools;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Tilemaps;

namespace Core.Tile
{
    public class MapManager : Singleton<MapManager>,
        IEventListener<SowPlantEvent>
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

        // Farmland state persisted across scene loads, keyed by locationId → tile coords
        [Flags]
        private enum FarmlandFlags { None = 0, Plowed = 1, Irrigated = 2 }
        private readonly Dictionary<string, Dictionary<Vector2Int, FarmlandFlags>> _farmlandState = new();

        // TODO: Rework
        public Dictionary<Vector2Int, PlaceableItem> Items = new();
        public Tilemap OverlayTilemap { get; private set; }

        #region Initialization

        protected override void OnAwake()
        {
            base.OnAwake();
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
            this.Subscribe<SowPlantEvent>();
        }

        protected void OnDisable()
        {
            this.Unsubscribe<SowPlantEvent>();
        }

        #endregion

        #region Tile Queries

        [CanBeNull]
        public TileData GetTileDataBelowCharacter(GameCharacter character)
        {
            return GetTileDataAtCoordinates(GetCurrentTileCoordinates(character));
        }

        [CanBeNull]
        public TileData GetTileDataInDirectionOfCharacter(GameCharacter character, Vector2 direction)
        {
            var origin = GetInteractionOriginTile(character);
            var target = origin + Vector2Int.RoundToInt(direction);
            return GetTileDataAtCoordinates(target);
        }

        [CanBeNull]
        public TileData GetTileDataAtCoordinates(Vector2Int coordinates)
        {
            return _tileDataCache?.GetValueOrDefault(coordinates);
        }

        public TileData GetTileDataAtWorldPosition(Vector2 worldPosition)
        {
            if (_terrainTilemap == null) return null;
            var cellPosition = TerrainTilemap().WorldToCell(worldPosition);
            return GetTileDataAtCoordinates(new Vector2Int(cellPosition.x, cellPosition.y));
        }

        private Tilemap TerrainTilemap()
        {
            return _terrainTilemap;
        }

        public List<TileData> GetTileDataAround(GameCharacter character, Vector2Int[] relativeTiles)
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

            var collider = Physics2D.OverlapBox(tileData.WorldPosition, new Vector2(1, 1), 0);
            if (collider != null) return true;

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

        public bool IsTileWithinRadiusOfCharacter(GameCharacter character, TileData targetTile, int radius)
        {
            return IsTileWithinRadius(character.CurrentTileData, targetTile, radius);
        }

        #endregion

        #region Coordinate Conversions

        public Vector2Int GetCurrentTileCoordinates(GameCharacter character)
        {
            var worldPosition = character.ToolInteractionAnchor.position;
                var cellPosition = _terrainTilemap.WorldToCell(worldPosition);
            return new Vector2Int(cellPosition.x, cellPosition.y);
        }

        public Vector2Int GetCurrentMainCharacterTileCoordinates()
        {
            return GetCurrentTileCoordinates(MainCharacter.CurrentMainCharacter);
        }

        public Vector2Int GetInteractionOriginTile(GameCharacter character)
        {
            var forward = character.Orientation.FacingDirection;
            var probeWorldPosition = (Vector2)character.ToolInteractionAnchor.position + forward * InteractionDistance;
            var cell = _terrainTilemap.WorldToCell(probeWorldPosition);
            return new Vector2Int(cell.x, cell.y);
        }

        public Vector2Int GetTileCoordinatesInDirection(GameCharacter character, Vector2 direction)
        {
            var currentCoordinates = GetCurrentTileCoordinates(character);
            return currentCoordinates + new Vector2Int((int)direction.x, (int)direction.y);
        }

        private Vector3 GetWorldPositionFromTileCoordinates(Vector2Int coordinates)
        {
            var cellPosition = new Vector3Int(coordinates.x, coordinates.y, 0);
            return _terrainTilemap.CellToWorld(cellPosition) + _terrainTilemap.cellSize / 2;
        }

        #endregion

        #region Tile Modifications

        public void PlowTile(TileData tile)
        {
            if (tile?.TerrainData.TerrainType != TerrainType.FarmLand) return;
            tile.FarmlandData?.Plow();
            SetTileAt(_plowedTilemap, tile.Coordinates, plowedFarmlandTile);
            UpdateFarmlandState(tile.Coordinates, plowed: true);
        }

        public void UnplowTile(TileData tile)
        {
            if (tile?.TerrainData.TerrainType != TerrainType.FarmLand) return;
            tile.FarmlandData?.Unplow();
            SetTileAt(_plowedTilemap, tile.Coordinates, null);
            UpdateFarmlandState(tile.Coordinates, plowed: false);
        }

        public void IrrigateTile(TileData tile)
        {
            if (tile?.TerrainData.TerrainType != TerrainType.FarmLand) return;
            tile.FarmlandData?.Irrigate();
            SetTileAt(_irrigatedTilemap, tile.Coordinates, irrigatedFarmlandTile);
            UpdateFarmlandState(tile.Coordinates, irrigated: true);
        }

        public void DryTile(TileData tile)
        {
            if (tile?.TerrainData.TerrainType != TerrainType.FarmLand) return;
            tile.DryOut();
            SetTileAt(_irrigatedTilemap, tile.Coordinates, null);
            UpdateFarmlandState(tile.Coordinates, irrigated: false);
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

        private void UpdateFarmlandState(Vector2Int coords, bool? plowed = null, bool? irrigated = null)
        {
            var locationId = LevelManager.Instance.CurrentLocationData?.id;
            if (locationId == null) return;

            if (!_farmlandState.TryGetValue(locationId, out var tileStates))
                _farmlandState[locationId] = tileStates = new Dictionary<Vector2Int, FarmlandFlags>();

            var current = tileStates.GetValueOrDefault(coords);
            if (plowed == true)   current |= FarmlandFlags.Plowed;
            if (plowed == false)  current &= ~FarmlandFlags.Plowed;
            if (irrigated == true)  current |= FarmlandFlags.Irrigated;
            if (irrigated == false) current &= ~FarmlandFlags.Irrigated;
            tileStates[coords] = current;
        }

        #endregion

        #region Tool Effect Configuration

        public List<TileData> GetTilesFromEffectConfiguration(GameCharacter character, ToolEffectConfiguration config)
        {
            if (config?.AffectedTileOffsets == null)
                return new List<TileData>();

            var originCoordinates = character.CurrentTileCoordinates;
            var facing            = character.Orientation.FacingDirection;

            return config.AffectedTileOffsets
                .Select(offset => RotateOffset(offset, facing))
                .Select(rotated => GetTileDataAtCoordinates(originCoordinates + rotated))
                .Where(tile => tile != null)
                .ToList();
        }

        /// <summary>Rotates a tile offset based on cardinal facing direction (Vector2).</summary>
        private static Vector2Int RotateOffset(Vector2Int offset, Vector2 facing)
        {
            if (facing.x > 0.5f)  return new Vector2Int(offset.y, -offset.x);  // East
            if (facing.y < -0.5f) return new Vector2Int(-offset.x, -offset.y); // South
            if (facing.x < -0.5f) return new Vector2Int(-offset.y, offset.x);  // West
            return offset;                                                        // North (default)
        }

        #endregion

        #region Map Initialization (event handlers)

        public void InitializeForLocation(LocationData location)
        {
            InitializeMap();
        }

        public void OnEvent(SowPlantEvent sowPlantEvent)
        {
            var tileData = GetTileDataAtCoordinates(sowPlantEvent.Position);
            if (tileData == null)
                throw new Exception($"Missing tile data for sowing plant at {sowPlantEvent.Position}");

            SpawnPlantInstance(sowPlantEvent.PlantId, sowPlantEvent.Position, tileData);
        }

        private void InitializeMap()
        {
            if (!LoadTilemapReferences()) return;

            ClearPlants();
            Items.Clear();
            BuildTileDataCache();
            RestoreFarmlandState();
            RestorePlants();
        }

        private bool LoadTilemapReferences()
        {
            var superMap = FindFirstObjectByType<SuperMap>();
            if (!superMap)
            {
                Debug.LogWarning("[MapManager] No SuperMap found in scene.");
                return false;
            }

            var superMapTransform = superMap.transform;
            _terrainTilemap   = FindTilemap(superMapTransform, "Terrain");
            _farmlandTilemap  = FindTilemap(superMapTransform, "FarmLand");
            _plowedTilemap    = FindTilemap(superMapTransform, "FarmLand_Plowed");
            _irrigatedTilemap = FindTilemap(superMapTransform, "FarmLand_Irrigated");
            OverlayTilemap    = FindTilemap(superMapTransform, "Overlay");
            return true;
        }

        private static Tilemap FindTilemap(Transform parent, string name)
        {
            return parent.MMFindDeepChildDepthFirst(name)?.GetComponent<Tilemap>();
        }

        private void BuildTileDataCache()
        {
            _tileDataCache = new Dictionary<Vector2Int, TileData>();
            var bounds = _terrainTilemap.cellBounds;

            ProcessTilemap(_terrainTilemap, bounds, ProcessTerrainTile);

            if (_farmlandTilemap != null)
                ProcessTilemap(_farmlandTilemap, bounds, ProcessFarmlandTile);
        }

        private void ProcessTilemap(Tilemap tilemap, BoundsInt bounds, Action<Vector2Int, SuperTile> processor)
        {
            for (int x = bounds.xMin; x < bounds.xMax; x++)
            for (int y = bounds.yMin; y < bounds.yMax; y++)
            {
                var cellPosition = new Vector3Int(x, y, 0);
                if (tilemap.GetTile(cellPosition) is SuperTile superTile)
                    processor(new Vector2Int(x, y), superTile);
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

        #region Plant Management

        private void ClearPlants()
        {
            for (int i = _plantParentGameObject.transform.childCount - 1; i >= 0; i--)
                Destroy(_plantParentGameObject.transform.GetChild(i).gameObject);
        }

        private void RestorePlants()
        {
            var locationId = LevelManager.Instance.CurrentLocationData?.id;
            if (locationId == null) return;

            foreach (var (pos, state) in PlantManager.Current.GetPlantStatesInLocation(locationId))
            {
                var tileData = GetTileDataAtCoordinates(pos);
                if (tileData == null) continue;
                SpawnPlantInstance(state.plantID, pos, tileData, state.growthStageIndex);
            }
        }

        private void SpawnPlantInstance(string plantId, Vector2Int pos, TileData tileData, int stageIndex = 0)
        {
            if (!PlantManager.Current.PlantData.TryGetValue(plantId, out var plantData)) return;
            if (stageIndex >= plantData.growthStages.Count) return;
            var instance = plantData.growthStages[stageIndex].representation
                .CreateInstance(_plantParentGameObject.transform);
            instance.transform.position = tileData.WorldPosition;
        }

        #endregion

        #region Farmland Persistence

        private void RestoreFarmlandState()
        {
            var locationId = LevelManager.Instance.CurrentLocationData?.id;
            if (locationId == null || !_farmlandState.TryGetValue(locationId, out var tileStates)) return;

            foreach (var (coords, flags) in tileStates)
            {
                var tile = GetTileDataAtCoordinates(coords);
                if (tile == null) continue;

                if (flags.HasFlag(FarmlandFlags.Plowed))
                {
                    tile.FarmlandData?.Plow();
                    SetTileAt(_plowedTilemap, coords, plowedFarmlandTile);
                }
                if (flags.HasFlag(FarmlandFlags.Irrigated))
                {
                    tile.FarmlandData?.Irrigate();
                    SetTileAt(_irrigatedTilemap, coords, irrigatedFarmlandTile);
                }
            }
        }

        #endregion
    }
}

using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Events;
using Core.Items;
using Core.Location;
using Core.Tile.Vulcan;
using JetBrains.Annotations;
using MoreMountains.Tools;
using Plants;
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

        private VulcanImportedMap _currentMap;
        private Tilemap _terrainTilemap;
        private Tilemap _farmlandTilemap;
        private Tilemap _plowedTilemap;
        private Tilemap _irrigatedTilemap;

        private GameObject _plantParentGameObject;
        private Dictionary<TerrainType, TerrainData> _terrainDataByType;
        private Dictionary<Vector2Int, TileData> _tileDataCache;


        // Farmland state persisted across scene loads, keyed by locationId → tile coords
        [Flags]
        private enum FarmlandFlags
        {
            None = 0,
            Plowed = 1,
            Irrigated = 2
        }

        private readonly Dictionary<string, Dictionary<Vector2Int, FarmlandFlags>> _farmlandState = new();

        // TODO: Fix calculation
        public Bounds CurrentBounds
        {
            get
            {
                // If we have a terrain tilemap, compute bounds using its cellBounds and cellSize
                if (_terrainTilemap != null)
                {
                    var cellBounds = _terrainTilemap.cellBounds;
                    var cellSize = _terrainTilemap.cellSize;

                    // World position of the minimum cell corner
                    var worldMin = _terrainTilemap.CellToWorld(new Vector3Int(cellBounds.xMin, cellBounds.yMin, 0));
                    // World position at the exclusive max indices; add cellSize to include the last cell area
                    var worldMax = _terrainTilemap.CellToWorld(new Vector3Int(cellBounds.xMax, cellBounds.yMax, 0)) + (Vector3)cellSize;

                    var center = (worldMin + worldMax) * 0.5f;
                    var size = worldMax - worldMin;
                    return new Bounds(center, size);
                }

                // Fallback to map metadata if available
                if (_currentMap != null)
                {
                    var width = Mathf.Max(1, _currentMap.Width);
                    var height = Mathf.Max(1, _currentMap.Height);
                    return new Bounds(_currentMap.transform.position, new Vector3(width, height, 0f));
                }

                return new Bounds(Vector3.zero, Vector3.zero);
            }
        }

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
            if (_terrainTilemap == null)
                return Vector2Int.zero;

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
            if (_terrainTilemap == null)
                return Vector2Int.zero;

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

        public bool TryGetAnchor(string anchorId, out VulcanMapAnchor anchor)
        {
            anchor = null;
            if (string.IsNullOrWhiteSpace(anchorId))
                return false;

            var anchors = FindObjectsByType<VulcanMapAnchor>(FindObjectsSortMode.None);
            anchor = Array.Find(anchors, candidate => string.Equals(candidate.AnchorId, anchorId, StringComparison.OrdinalIgnoreCase));
            return anchor != null;
        }

        public bool TryPlaceCharacterAtEntry(GameCharacter character, string entryKey, Vector2 facingDirection)
        {
            if (character == null || !TryGetAnchor(entryKey, out var anchor))
                return false;

            character.transform.position = anchor.transform.position;

            var resolvedFacing = anchor.FacingDirection != Vector2.zero
                ? anchor.FacingDirection
                : (facingDirection != Vector2.zero ? facingDirection : Vector2.down);
            character.Orientation.ForceDirection(resolvedFacing);
            return true;
        }

        #endregion

        #region Tile Modifications

        public void PlowTile(TileData tile)
        {
            if (!tile.IsFarmable) return;
            tile.FarmlandData?.Plow();
            SetTileAt(_plowedTilemap, tile.Coordinates, plowedFarmlandTile);
            UpdateFarmlandState(tile.Coordinates, plowed: true);
        }

        public void UnplowTile(TileData tile)
        {
            if (!tile.IsFarmable) return;
            tile.FarmlandData?.Unplow();
            SetTileAt(_plowedTilemap, tile.Coordinates, null);
            UpdateFarmlandState(tile.Coordinates, plowed: false);
        }

        public void IrrigateTile(TileData tile)
        {
            if (!tile.IsFarmable) return;
            tile.FarmlandData?.Irrigate();
            SetTileAt(_irrigatedTilemap, tile.Coordinates, irrigatedFarmlandTile);
            UpdateFarmlandState(tile.Coordinates, irrigated: true);
        }

        public void DryTile(TileData tile)
        {
            if (!tile.IsFarmable) return;
            tile.DryOut();
            SetTileAt(_irrigatedTilemap, tile.Coordinates, null);
            UpdateFarmlandState(tile.Coordinates, irrigated: false);
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
            if (plowed == true) current |= FarmlandFlags.Plowed;
            if (plowed == false) current &= ~FarmlandFlags.Plowed;
            if (irrigated == true) current |= FarmlandFlags.Irrigated;
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
            var facing = character.Orientation.FacingDirection;

            return config.AffectedTileOffsets
                .Select(offset => RotateOffset(offset, facing))
                .Select(rotated => GetTileDataAtCoordinates(originCoordinates + rotated))
                .Where(tile => tile != null)
                .ToList();
        }

        /// <summary>Rotates a tile offset based on cardinal facing direction (Vector2).</summary>
        private static Vector2Int RotateOffset(Vector2Int offset, Vector2 facing)
        {
            if (facing.x > 0.5f) return new Vector2Int(offset.y, -offset.x); // East
            if (facing.y < -0.5f) return new Vector2Int(-offset.x, -offset.y); // South
            if (facing.x < -0.5f) return new Vector2Int(-offset.y, offset.x); // West
            return offset; // North (default)
        }

        #endregion

        #region Map Initialization (event handlers)

        public void InitializeForLocation(LocationData location)
        {
            EnsureLocationMapInstance(location);
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
            _currentMap = FindFirstObjectByType<VulcanImportedMap>();
            if (_currentMap != null)
            {
                _terrainTilemap = _currentMap.TerrainTilemap;
                _farmlandTilemap = _currentMap.FarmlandTilemap;
                _plowedTilemap = _currentMap.PlowedTilemap;
                _irrigatedTilemap = _currentMap.IrrigatedTilemap;
                OverlayTilemap = _currentMap.OverlayTilemap;
            }
            else
            {
                var grid = FindFirstObjectByType<Grid>();
                var mapRoot = grid != null ? grid.transform.parent : null;
                if (mapRoot == null)
                {
                    Debug.LogWarning("[MapManager] No imported map found in scene.");
                    return false;
                }

                _terrainTilemap = FindTilemap(mapRoot, "Terrain");
                _farmlandTilemap = FindTilemap(mapRoot, "FarmLand");
                _plowedTilemap = FindTilemap(mapRoot, "FarmLand_Plowed");
                _irrigatedTilemap = FindTilemap(mapRoot, "FarmLand_Irrigated");
                OverlayTilemap = FindTilemap(mapRoot, "Overlay");
            }

            _plowedTilemap = EnsureTilemap(_plowedTilemap, "FarmLand_Plowed", 10, 0.5f);
            _irrigatedTilemap = EnsureTilemap(_irrigatedTilemap, "FarmLand_Irrigated", 11, 0.5f);
            OverlayTilemap = EnsureTilemap(OverlayTilemap, "Overlay", 999, 0.5f);

            if (_terrainTilemap == null)
            {
                Debug.LogWarning("[MapManager] Missing Terrain tilemap in imported map.");
                return false;
            }

            return true;
        }

        private static Tilemap FindTilemap(Transform parent, string name)
        {
            return parent?.MMFindDeepChildDepthFirst(name)?.GetComponent<Tilemap>();
        }

        private Tilemap EnsureTilemap(Tilemap tilemap, string tilemapName, int sortOrder, float alpha)
        {
            if (tilemap != null)
                return tilemap;

            var grid = FindFirstObjectByType<Grid>();
            if (grid == null)
                return null;

            var existing = FindTilemap(grid.transform.parent, tilemapName);
            if (existing != null)
                return existing;

            var tilemapObject = new GameObject(tilemapName);
            tilemapObject.transform.SetParent(grid.transform, false);
            // Keep overlay tilemaps aligned with the grid origin. Visual offset is handled at the Grid level.
            tilemapObject.transform.localPosition = Vector3.zero;

            var createdTilemap = tilemapObject.AddComponent<Tilemap>();
            createdTilemap.color = new Color(1f, 1f, 1f, alpha);

            var tilemapRenderer = tilemapObject.AddComponent<TilemapRenderer>();
            tilemapRenderer.sortOrder = TilemapRenderer.SortOrder.TopLeft;
            tilemapRenderer.sortingOrder = sortOrder;

            return createdTilemap;
        }

        private void BuildTileDataCache()
        {
            _tileDataCache = new Dictionary<Vector2Int, TileData>();

            // All tilemaps are children of the same Grid, so cell coordinates are
            // shared across layers. Process terrain first, then farmland layers
            // overwrite matching entries so farmland takes precedence.
            if (_terrainTilemap != null)
                ProcessTerrainTilemap(_terrainTilemap);

            // Farmland layers overwrite terrain entries at matching coordinates.
            if (_farmlandTilemap != null)
                ProcessFarmlandTilemap(_farmlandTilemap);
        }

        private void ProcessTerrainTilemap(Tilemap tilemap)
        {
            var cellBounds = tilemap.cellBounds;
            for (int x = cellBounds.xMin; x < cellBounds.xMax; x++)
                for (int y = cellBounds.yMin; y < cellBounds.yMax; y++)
                {
                    var cell = new Vector3Int(x, y, 0);
                    var tile = tilemap.GetTile(cell) as VulcanTile;
                    if (tile == null) continue;

                    var coords = new Vector2Int(x, y);
                    var terrainType = ResolveTerrainType(coords, tile);

                    // For now, farmland is always dirt
                    if (tile.IsFarmable)
                        terrainType = TerrainType.Dirt;

                    if (terrainType == TerrainType.Invalid)
                        terrainType = TerrainType.Dirt;

                    if (!_terrainDataByType.TryGetValue(terrainType, out var terrainData))
                        continue;

                    var worldPosition = GetWorldPositionFromTileCoordinates(coords);
                    var tileData = new TileData(tile, x, y, terrainData, worldPosition, tile.IsFarmable);

                    if (tileData.IsFarmable)
                        tileData.TryEnableFarmland();

                    _tileDataCache[coords] = tileData;
                }
        }

        private void ProcessFarmlandTilemap(Tilemap tilemap)
        {
            // Use dirt terrain data for now
            var dirtData = _terrainDataByType.GetValueOrDefault(TerrainType.Dirt);

            var cellBounds = tilemap.cellBounds;
            for (int x = cellBounds.xMin; x < cellBounds.xMax; x++)
                for (int y = cellBounds.yMin; y < cellBounds.yMax; y++)
                {
                    var cell = new Vector3Int(x, y, 0);
                    var tile = tilemap.GetTile(cell) as VulcanTile;
                    if (tile == null) continue;

                    var coords = new Vector2Int(x, y);
                    var worldPosition = GetWorldPositionFromTileCoordinates(coords);
                    // Do not overwrite tiles that were explicitly marked farmable by tile properties.
                    // if (_tileDataCache != null && _tileDataCache.TryGetValue(coords, out var existing) && existing != null && existing.IsFarmable)
                    //     continue;

                    if (tile.IsFarmable)
                    {
                        var tileData = new TileData(tile, x, y, dirtData, worldPosition, true);
                        tileData.TryEnableFarmland();
                        _tileDataCache[coords] = tileData;
                    }
                }
        }

        private TerrainType ResolveTerrainType(Vector2Int coordinates, TileBase tileBase)
        {
            if (_currentMap != null && _currentMap.TryGetTerrainType(coordinates, out var terrainFromMap))
                return terrainFromMap;

            if (tileBase is VulcanTile vulcanTile)
                return vulcanTile.TerrainType;

            return TerrainType.Invalid;
        }

        private void EnsureLocationMapInstance(LocationData location)
        {
            // Scene was generated with the map prefab already placed inside it — no need to spawn.
            if (FindFirstObjectByType<VulcanImportedMap>() != null)
                return;

            Debug.LogWarning($"[MapManager] No VulcanImportedMap found in scene for location '{location?.id}'. Scene may be missing its map prefab.");
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

            var go = new GameObject(plantData.label + "_" + plantId);
            go.transform.SetParent(_plantParentGameObject.transform);
            go.transform.position = tileData.WorldPosition;

            var locationId = LevelManager.Instance.CurrentLocationData?.id;
            go.AddComponent<FarmablePlant>().Initialize(locationId, pos, plantData, stageIndex);
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


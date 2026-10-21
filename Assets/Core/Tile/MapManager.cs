using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Character;
using Core.Events;
using Core.Game;
using Core.Items;
using Core.Location;
using Core.Tile.Vulcanus;
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
        IEventListener<SowPlantEvent>, IEventListener<FarmlandDriedEvent>
    {
        [SerializeField] private TerrainData[] tileDataTypes;
        [SerializeField] RuleTile plowedFarmlandTile;
        [SerializeField] RuleTile irrigatedFarmlandTile;

        private const float InteractionDistance = 0.55f;
        private const string FarmlandObjectPrefix = "farmland:";

        private VulcanusImportedMap _currentMap;
        public VulcanusImportedMap CurrentMap => _currentMap;
        private Tilemap _terrainTilemap;
        private Tilemap _plowedTilemap;
        private Tilemap _irrigatedTilemap;

        private GameObject _plantParentGameObject;
        private Dictionary<TerrainType, TerrainData> _terrainDataByType;
        private Dictionary<Vector2Int, TileData> _tileDataCache;
        private readonly List<Collider2D> _occupancyColliders = new();

        public Bounds CurrentBounds
        {
            get
            {
                // Tilemap.cellBounds max is already exclusive, so CellToWorld(max) gives us the
                // outer map edge directly.
                if (_terrainTilemap != null)
                {
                    var cellBounds = _terrainTilemap.cellBounds;
                    if (cellBounds.size == Vector3Int.zero)
                        return new Bounds(Vector3.zero, Vector3.zero);

                    var worldMin = _terrainTilemap.CellToWorld(new Vector3Int(cellBounds.xMin, cellBounds.yMin, 0));
                    var worldMax = _terrainTilemap.CellToWorld(new Vector3Int(cellBounds.xMax, cellBounds.yMax, 0));

                    var min = Vector3.Min(worldMin, worldMax);
                    var max = Vector3.Max(worldMin, worldMax);
                    min.z = 0f;
                    max.z = 0f;

                    return new Bounds((min + max) * 0.5f, max - min);
                }

                // Fallback to map metadata if available
                if (_currentMap != null)
                {
                    var width = Mathf.Max(1, _currentMap.Width);
                    var height = Mathf.Max(1, _currentMap.Height);
                    var min = _currentMap.transform.position;
                    var max = min + new Vector3(width, height, 0f);
                    return new Bounds((min + max) * 0.5f, max - min);
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
            sortingGroup.sortingLayerName = "Foreground";
            sortingGroup.sortingOrder = 1;
        }

        protected void OnEnable()
        {
            this.Subscribe<SowPlantEvent>();
            this.Subscribe<FarmlandDriedEvent>();
        }

        protected void OnDisable()
        {
            this.Unsubscribe<SowPlantEvent>();
            this.Unsubscribe<FarmlandDriedEvent>();
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
            // Tile tools address neighbours of the standing cell, regardless of sub-cell position.
            var origin = GetCurrentTileCoordinates(character);
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

        /// <summary>Checks solid obstacles and crops, excluding sensors and the character performing the action.</summary>
        public bool IsTileOccupied(TileData tileData, GameCharacter actingCharacter = null)
        {
            if (tileData == null) return true;

            // A character's sensor can reach neighbouring cells without occupying them.
            var filter = new ContactFilter2D { useTriggers = false };
            filter.SetLayerMask(Physics2D.DefaultRaycastLayers);
            Physics2D.OverlapBox(tileData.WorldPosition, Vector2.one, 0f, filter, _occupancyColliders);
            foreach (var collider in _occupancyColliders)
                if (!actingCharacter || !collider.transform.IsChildOf(actingCharacter.transform))
                    return true;

            if (PlantManager.Instance.HasPlantAtCurrentMap(tileData.Coordinates))
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
            return IsTileWithinRadius(character.Tiles.Current, targetTile, radius);
        }

        #endregion

        #region Coordinate Conversions

        public Vector2Int WorldToTileCoordinates(Vector2 worldPosition)
        {
            if (!_terrainTilemap) throw new InvalidOperationException("Tile queries require an initialized location map.");
            var cell = _terrainTilemap.WorldToCell(worldPosition);
            return new Vector2Int(cell.x, cell.y);
        }

        public Vector2Int GetCurrentTileCoordinates(GameCharacter character) =>
            WorldToTileCoordinates(character.ToolInteractionAnchor.position);

        public Vector2Int GetCurrentMainCharacterTileCoordinates()
        {
            return GetCurrentTileCoordinates(MainCharacter.CurrentMainCharacter);
        }

        public Vector2Int GetInteractionOriginTile(GameCharacter character) =>
            GetInteractionOriginTile(character.ToolInteractionAnchor.position, character.Orientation.FacingDirection);

        public Vector2Int GetInteractionOriginTile(Vector2 anchor, Vector2 facing) =>
            WorldToTileCoordinates(anchor + facing * InteractionDistance);

        public Vector2Int GetTileCoordinatesInDirection(GameCharacter character, Vector2 direction)
        {
            var currentCoordinates = GetCurrentTileCoordinates(character);
            return currentCoordinates + new Vector2Int((int)direction.x, (int)direction.y);
        }

        private Vector3 GetWorldPositionFromTileCoordinates(Vector2Int coordinates)
        {
            var cellPosition = new Vector3Int(coordinates.x, coordinates.y, 0);
            return _terrainTilemap.GetCellCenterWorld(cellPosition);
        }

        public bool TryGetAnchor(string anchorId, out VulcanusMapAnchor anchor)
        {
            anchor = null;
            if (string.IsNullOrWhiteSpace(anchorId))
                return false;

            var anchors = FindObjectsByType<VulcanusMapAnchor>(FindObjectsSortMode.None);
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
            character.Tiles.OnPlaced();
            return true;
        }

        #endregion

        #region Tile Modifications

        public void PlowTile(TileData tile)
        {
            if (!tile.TryPlow()) return;
            SetTileAt(_plowedTilemap, tile.Coordinates, plowedFarmlandTile);
            UpdateFarmlandState(tile.Coordinates, plowed: true);
        }

        public void UnplowTile(TileData tile)
        {
            if (!tile.IsFarmable) return;
            tile.FarmlandData?.Unplow();
            SetTileAt(_plowedTilemap, tile.Coordinates, null);
            SetTileAt(_irrigatedTilemap, tile.Coordinates, null);
            UpdateFarmlandState(tile.Coordinates, plowed: false, irrigated: false);
        }

        public void IrrigateTile(TileData tile)
        {
            if (!tile.IsFarmable || tile.FarmlandData is not { IsPlowed: true }) return;
            tile.TryWater();
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

            var objectId = FarmlandObjectId(coords);
            if (!GameState.World.TryGet<FarmlandState>(locationId, objectId, out var state))
                state = new FarmlandState();

            if (plowed.HasValue) state.plowed = plowed.Value;
            if (irrigated.HasValue) state.irrigated = irrigated.Value;

            if (!state.plowed && !state.irrigated)
                GameState.World.Remove(locationId, objectId);
            else
                GameState.World.Set(locationId, objectId, state);
        }

        internal static string FarmlandObjectId(Vector2Int coords) =>
            FarmlandObjectPrefix + coords.x.ToString(CultureInfo.InvariantCulture) + "," + coords.y.ToString(CultureInfo.InvariantCulture);

        internal static Vector2Int ParseFarmlandObjectId(string objectId)
        {
            if (!objectId.StartsWith(FarmlandObjectPrefix, StringComparison.Ordinal))
                throw new FormatException($"Invalid farmland object ID '{objectId}'.");

            var parts = objectId.Substring(FarmlandObjectPrefix.Length).Split(',');
            if (parts.Length != 2 ||
                !int.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var x) ||
                !int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var y))
                throw new FormatException($"Invalid farmland object ID '{objectId}'.");

            return new Vector2Int(x, y);
        }

        #endregion

        #region Tool Effect Configuration

        public List<TileData> GetTilesFromEffectConfiguration(GameCharacter character, ToolEffectConfiguration config)
        {
            if (config?.AffectedTileOffsets == null)
                return new List<TileData>();

            var originCoordinates = character.Tiles.Coordinates;
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
            if (sowPlantEvent.LocationId != LevelManager.Instance.CurrentLocationData?.id) return;

            var tileData = GetTileDataAtCoordinates(sowPlantEvent.Position);
            if (tileData == null)
                throw new Exception($"Missing tile data for sowing plant at {sowPlantEvent.Position}");

            SpawnPlantInstance(sowPlantEvent.PlantId, sowPlantEvent.Position, tileData);
        }

        public void OnEvent(FarmlandDriedEvent e)
        {
            if (e.LocationId != LevelManager.Instance.CurrentLocationData?.id) return;
            // WorldState also permits farmland records that do not identify a map cell.
            if (!e.ObjectId.StartsWith(FarmlandObjectPrefix, StringComparison.Ordinal)) return;
            var position = ParseFarmlandObjectId(e.ObjectId);
            // A prior callback may already have watered the tile for the new day.
            if (GameState.World.TryGet<FarmlandState>(e.LocationId, e.ObjectId, out var state)
                && state.irrigated) return;
            GetTileDataAtCoordinates(position)?.DryOut();
            SetTileAt(_irrigatedTilemap, position, null);
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
            _currentMap = FindFirstObjectByType<VulcanusImportedMap>();
            if (_currentMap != null)
            {
                _terrainTilemap = _currentMap.TerrainTilemap;
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
                _plowedTilemap = FindTilemap(mapRoot, "FarmLand_Plowed");
                _irrigatedTilemap = FindTilemap(mapRoot, "FarmLand_Irrigated");
                OverlayTilemap = FindTilemap(mapRoot, "Overlay");
            }

            _plowedTilemap = EnsureTilemap(_plowedTilemap, "FarmLand_Plowed", 10, 0.5f);
            _irrigatedTilemap = EnsureTilemap(_irrigatedTilemap, "FarmLand_Irrigated", 11, 0.5f);
            OverlayTilemap = EnsureTilemap(OverlayTilemap, "Overlay", 999, 0.5f);
            OverlayTilemap.GetComponent<TilemapRenderer>().sortingLayerName = "Above";

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
            var tiles = new Dictionary<Vector2Int, VulcanusTile>();
            var farmableCells = new HashSet<Vector2Int>();
            var freshwaterCells = new HashSet<Vector2Int>();

            // Cell properties combine across all authored layers, independent of
            // which layer supplies the terrain. Unmarked decoration cannot erase them.
            foreach (var layer in _terrainTilemap.layoutGrid.GetComponentsInChildren<Tilemap>(includeInactive: true))
                foreach (var cell in layer.cellBounds.allPositionsWithin)
                {
                    if (layer.GetTile(cell) is not VulcanusTile tile) continue;
                    var coords = new Vector2Int(cell.x, cell.y);
                    if (tile.IsFarmable) farmableCells.Add(coords);
                    if (tile.IsFreshwater) freshwaterCells.Add(coords);

                    // Prefer the terrain tile. Property-bearing tiles also define
                    // usable cells where no underlying terrain tile is painted.
                    if (layer == _terrainTilemap)
                        tiles[coords] = tile;
                    else if (tile.IsFarmable || tile.IsFreshwater)
                        tiles.TryAdd(coords, tile);
                }

            foreach (var (coords, tile) in tiles)
            {
                var isFarmable = farmableCells.Contains(coords);
                // Preserve the current rule that farmable cells use dirt terrain.
                var terrainType = isFarmable ? TerrainType.Dirt : ResolveTerrainType(coords, tile);
                if (terrainType == TerrainType.Invalid)
                    terrainType = TerrainType.Dirt;
                if (!_terrainDataByType.TryGetValue(terrainType, out var terrainData))
                    throw new InvalidOperationException($"Map cell {coords} requires configured terrain data for {terrainType}.");

                var tileData = new TileData(tile, coords.x, coords.y, terrainData,
                    GetWorldPositionFromTileCoordinates(coords), isFarmable, freshwaterCells.Contains(coords));
                if (isFarmable) tileData.TryEnableFarmland();
                _tileDataCache.Add(coords, tileData);
            }
        }

        private TerrainType ResolveTerrainType(Vector2Int coordinates, TileBase tileBase)
        {
            if (_currentMap != null && _currentMap.TryGetTerrainType(coordinates, out var terrainFromMap))
                return terrainFromMap;

            if (tileBase is VulcanusTile VulcanusTile)
                return VulcanusTile.TerrainType;

            return TerrainType.Invalid;
        }

        private void EnsureLocationMapInstance(LocationData location)
        {
            // Scene was generated with the map prefab already placed inside it — no need to spawn.
            if (FindFirstObjectByType<VulcanusImportedMap>() != null)
                return;

            Debug.LogWarning($"[MapManager] No VulcanusImportedMap found in scene for location '{location?.id}'. Scene may be missing its map prefab.");
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

            foreach (var (pos, state) in PlantManager.Instance.GetPlantStatesInLocation(locationId))
            {
                var tileData = GetTileDataAtCoordinates(pos);
                if (tileData == null) continue;
                SpawnPlantInstance(state.plantID, pos, tileData);
            }
        }

        private void SpawnPlantInstance(string plantId, Vector2Int pos, TileData tileData)
        {
            var manager = PlantManager.Instance;
            if (!manager.TryGetPlantData(plantId, out var plantData)) return;

            var go = new GameObject(plantData.label + "_" + plantId);
            go.SetActive(false);
            go.transform.SetParent(_plantParentGameObject.transform);
            go.transform.position = tileData.WorldPosition;

            var locationId = LevelManager.Instance.CurrentLocationData.id;
            go.AddComponent<FarmablePlant>().Bind(locationId, pos, plantData, manager.GetPlantState(locationId, pos));
            go.SetActive(true);
        }

        #endregion

        #region Farmland Persistence

        private void RestoreFarmlandState()
        {
            var locationId = LevelManager.Instance.CurrentLocationData?.id;
            if (locationId == null) return;

            foreach (var pair in GameState.World.GetStates<FarmlandState>(locationId))
            {
                var coords = ParseFarmlandObjectId(pair.Key);
                var state = pair.Value;
                var tile = GetTileDataAtCoordinates(coords);
                if (tile == null || !tile.IsFarmable) continue;

                if (state.plowed)
                {
                    tile.FarmlandData?.Plow();
                    SetTileAt(_plowedTilemap, coords, plowedFarmlandTile);
                }

                if (state.irrigated && state.plowed)
                {
                    tile.FarmlandData?.Irrigate();
                    SetTileAt(_irrigatedTilemap, coords, irrigatedFarmlandTile);
                }
            }
        }

        #endregion
    }
}

using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Core.Game;
using Core.Events;
using Core.Location;
using Core.TimeAndWeather;
using Core.Tile.Vulcanus;
using NUnit.Framework;
using Plants;
using UnityEngine;
using UnityEngine.Tilemaps;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor
{
    [Category("FarmingTerrain")]
    public sealed class MapManagerTests
    {
        private GameObject _root;
        private GameStateManager _state;
        private LevelManager _level;
        private MapManager _map;
        private Grid _grid;
        private Tilemap _terrain;
        private Tilemap _farmland;
        private Tilemap _plowed;
        private Tilemap _irrigated;
        private RuleTile _plowedTile;
        private RuleTile _irrigatedTile;
        private LocationData _location;
        private readonly List<Object> _assets = new();

        [SetUp]
        public void SetUp()
        {
            Assert.That(GameStateManager.Instance, Is.Null, "Run outside a game session.");
            Assert.That(LevelManager.Instance, Is.Null, "Run outside a game session.");
            Assert.That(MapManager.Instance, Is.Null, "Run outside a game session.");
            _root = new GameObject("Map manager tests");
            _root.SetActive(false);
            _state = _root.AddComponent<GameStateManager>();
            typeof(Core.Singleton<GameStateManager>).GetMethod("Awake", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(_state, null);
            _level = _root.AddComponent<LevelManager>();
            // Register only the isolated location provider; do not initialize scene loading.
            typeof(Core.Singleton<LevelManager>).GetField("_instance", BindingFlags.Static | BindingFlags.NonPublic)
                .SetValue(null, _level);
            _location = Asset<LocationData>();
            _location.id = "test:farm";
            Set(_level, "<CurrentLocationData>k__BackingField", _location);
            _map = _root.AddComponent<MapManager>();
            var terrainTypes = new Dictionary<TerrainType, TerrainData>();
            foreach (var type in new[] { TerrainType.Dirt, TerrainType.Grass, TerrainType.Sand, TerrainType.Water })
            {
                var data = Asset<TerrainData>();
                Set(data, "terrainType", type);
                terrainTypes.Add(type, data);
            }
            Set(_map, "_terrainDataByType", terrainTypes);
            _grid = _root.AddComponent<Grid>();
            _terrain = Tilemap("Terrain");
            _farmland = Tilemap("Farmland");
            _plowed = Tilemap("Plowed");
            _irrigated = Tilemap("Irrigated");
            _plowedTile = Asset<RuleTile>();
            _irrigatedTile = Asset<RuleTile>();
            Set(_map, "_terrainTilemap", _terrain);
            Set(_map, "_farmlandTilemap", _farmland);
            Set(_map, "_plowedTilemap", _plowed);
            Set(_map, "_irrigatedTilemap", _irrigated);
            Set(_map, "plowedFarmlandTile", _plowedTile);
            Set(_map, "irrigatedFarmlandTile", _irrigatedTile);
        }

        [TearDown]
        public void TearDown()
        {
            if (_state) typeof(GameStateManager).GetMethod("OnDestroy", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(_state, null);
            if (_level && LevelManager.Instance == _level)
                typeof(Core.Singleton<LevelManager>).GetField("_instance", BindingFlags.Static | BindingFlags.NonPublic)
                    .SetValue(null, null);
            Object.DestroyImmediate(_root);
            foreach (var asset in _assets) Object.DestroyImmediate(asset);
            _assets.Clear();
        }

        [TestCase(TerrainType.Dirt)]
        [TestCase(TerrainType.Grass)]
        [TestCase(TerrainType.Sand)]
        [TestCase(TerrainType.Water)]
        [TestCase(TerrainType.Invalid)]
        public void CacheUsesTileTerrainWithDirtAsTheInvalidFallback(TerrainType type)
        {
            _terrain.SetTile(new Vector3Int(-2, 3), Tile(type));
            BuildCache();
            var tile = _map.GetTileDataAtCoordinates(new Vector2Int(-2, 3));
            var expected = type == TerrainType.Invalid ? TerrainType.Dirt : type;
            Assert.That(tile.TerrainData.TerrainType, Is.EqualTo(expected));
            Assert.That(tile.IsFarmable, Is.False);
            Assert.That(tile.FarmlandData, Is.Null);
            Assert.That(_map.GetTileDataForTerrainType(expected), Has.Count.EqualTo(1));
            Assert.That(_map.GetTileDataAtCoordinates(Vector2Int.zero), Is.Null);
        }

        [Test]
        public void AuthoredCellTerrainOverridesTileTerrain()
        {
            var imported = _root.AddComponent<VulcanusImportedMap>();
            imported.SetTerrainCells(new[]
            {
                new VulcanusImportedMap.TerrainCell { x = 2, y = -1, terrainType = TerrainType.Sand }
            });
            Set(_map, "_currentMap", imported);
            _terrain.SetTile(new Vector3Int(2, -1), Tile(TerrainType.Grass));
            BuildCache();
            Assert.That(_map.GetTileDataAtCoordinates(new Vector2Int(2, -1)).TerrainData.TerrainType,
                Is.EqualTo(TerrainType.Sand));
        }

        [Test]
        public void FarmableTerrainAlwaysUsesDirtAndInitializesUnplowedFarmland()
        {
            _terrain.SetTile(Vector3Int.zero, Tile(TerrainType.Water, true));
            BuildCache();
            var tile = _map.GetTileDataAtCoordinates(Vector2Int.zero);
            Assert.That(tile.IsFarmable, Is.True);
            Assert.That(tile.TerrainData.TerrainType, Is.EqualTo(TerrainType.Dirt));
            Assert.That(tile.FarmlandData.IsPlowed, Is.False);
            Assert.That(tile.FarmlandData.IsIrrigated, Is.False);
        }

        [TestCase(true)]
        [TestCase(false)]
        public void OnlyFarmableTilesOnTheFarmlandLayerOverrideTerrain(bool farmable)
        {
            _terrain.SetTile(Vector3Int.zero, Tile(TerrainType.Grass));
            _farmland.SetTile(Vector3Int.zero, Tile(TerrainType.Sand, farmable));
            BuildCache();
            var tile = _map.GetTileDataAtCoordinates(Vector2Int.zero);
            Assert.That(tile.IsFarmable, Is.EqualTo(farmable));
            Assert.That(tile.TerrainData.TerrainType, Is.EqualTo(farmable ? TerrainType.Dirt : TerrainType.Grass));
        }

        [Test]
        public void CacheOmitsEmptyCellsAndUnrecognizedTilesAndRebuildsWithoutStaleEntries()
        {
            _terrain.SetTile(Vector3Int.zero, Tile(TerrainType.Grass));
            _terrain.SetTile(new Vector3Int(2, 0), Asset<UnityEngine.Tilemaps.Tile>());
            BuildCache();
            Assert.That(_map.GetTileDataAtCoordinates(Vector2Int.right), Is.Null);
            Assert.That(_map.GetTileDataAtCoordinates(new Vector2Int(2, 0)), Is.Null);
            _terrain.SetTile(Vector3Int.zero, null);
            BuildCache();
            Assert.That(_map.GetTileDataAtCoordinates(Vector2Int.zero), Is.Null);
        }

        [Test]
        public void CachedWorldCentersAndWorldQueriesHonorGridTranslationScaleAndCellSize()
        {
            _root.transform.position = new Vector3(10, -5);
            _root.transform.localScale = new Vector3(2, 3, 1);
            _grid.cellSize = new Vector3(2, 1, 1);
            var cell = new Vector3Int(-2, 3);
            _terrain.SetTile(cell, Tile(TerrainType.Grass));
            BuildCache();
            var tile = _map.GetTileDataAtCoordinates(new Vector2Int(cell.x, cell.y));
            var expected = (Vector2)_terrain.GetCellCenterWorld(cell);
            Assert.That(Vector2.Distance(tile.WorldPosition, expected), Is.LessThan(0.0001f));
            Assert.That(_map.GetTileDataAtWorldPosition(expected), Is.SameAs(tile));
            Assert.That(_map.GetTileDataAtWorldPosition(new Vector2(100, 100)), Is.Null);
        }

        [Test]
        public void BoundsUseTheExclusiveMaximumCellAndGridTransform()
        {
            _root.transform.position = new Vector3(10, -5);
            _root.transform.localScale = new Vector3(2, 3, 1);
            _terrain.SetTile(new Vector3Int(-2, -1), Tile(TerrainType.Grass));
            _terrain.SetTile(new Vector3Int(1, 2), Tile(TerrainType.Grass));
            _terrain.CompressBounds();
            var bounds = _map.CurrentBounds;
            Assert.That(bounds.min, Is.EqualTo(new Vector3(6, -8, 0)));
            Assert.That(bounds.max, Is.EqualTo(new Vector3(14, 4, 0)));
        }

        [Test]
        public void EmptyTerrainHasEmptyBounds()
        {
            _terrain.CompressBounds();
            Assert.That(_map.CurrentBounds.size, Is.EqualTo(Vector3.zero));
        }

        [TestCase(3, 4, 5, true)]
        [TestCase(4, 4, 5, false)]
        [TestCase(0, 0, 0, true)]
        [TestCase(1, 0, 0, false)]
        public void TileRadiusIsEuclideanAndInclusive(int x, int y, int radius, bool expected)
        {
            var source = new TileData(null, 0, 0, null, Vector3.zero);
            var target = new TileData(null, x, y, null, Vector3.zero);
            Assert.That(_map.IsTileWithinRadius(source, target, radius), Is.EqualTo(expected));
        }

        [Test]
        public void PlowingCreatesRuntimeFarmlandAndWateringDryingAndUnplowingKeepAllLayersInSync()
        {
            var tile = new TileData(null, -2, 3, null, Vector3.zero, true);
            var cell = new Vector3Int(-2, 3);
            _map.PlowTile(tile);
            Assert.That(tile.FarmlandData.IsPlowed, Is.True);
            AssertLand(true, false);
            Assert.That(_plowed.GetTile(cell), Is.SameAs(_plowedTile));
            _map.IrrigateTile(tile);
            Assert.That(tile.FarmlandData.IsIrrigated, Is.True);
            AssertLand(true, true);
            Assert.That(_irrigated.GetTile(cell), Is.SameAs(_irrigatedTile));
            _map.DryTile(tile);
            Assert.That(tile.FarmlandData.IsPlowed, Is.True);
            Assert.That(tile.FarmlandData.IsIrrigated, Is.False);
            AssertLand(true, false);
            Assert.That(_irrigated.GetTile(cell), Is.Null);
            _map.IrrigateTile(tile);
            _map.UnplowTile(tile);
            Assert.That(tile.FarmlandData.IsPlowed, Is.False);
            Assert.That(tile.FarmlandData.IsIrrigated, Is.False);
            Assert.That(_plowed.GetTile(cell), Is.Null);
            Assert.That(_irrigated.GetTile(cell), Is.Null);
            Assert.That(GameState.World.GetStates<FarmlandState>(), Is.Empty);
        }

        [TestCase(false)]
        [TestCase(true)]
        public void WateringUnplowedFarmlandDoesNotWriteAnOverlayOrSaveRecord(bool enabled)
        {
            var tile = new TileData(null, -2, 3, null, Vector3.zero, true);
            if (enabled) tile.TryEnableFarmland();
            _map.IrrigateTile(tile);
            Assert.That(tile.FarmlandData?.IsIrrigated ?? false, Is.False);
            Assert.That(_irrigated.GetTile(new Vector3Int(-2, 3)), Is.Null);
            Assert.That(GameState.World.GetStates<FarmlandState>(), Is.Empty);
        }

        [Test]
        public void NonfarmableTerrainDoesNotChangeOrPersistUnderMapFarmingOperations()
        {
            var tile = new TileData(null, -2, 3, null, Vector3.zero);
            _map.PlowTile(tile);
            _map.IrrigateTile(tile);
            _map.DryTile(tile);
            _map.UnplowTile(tile);
            Assert.That(tile.FarmlandData, Is.Null);
            Assert.That(_plowed.GetTile(new Vector3Int(-2, 3)), Is.Null);
            Assert.That(_irrigated.GetTile(new Vector3Int(-2, 3)), Is.Null);
            Assert.That(GameState.World.GetStates<FarmlandState>(), Is.Empty);
        }

        [Test]
        public void RestoreUsesOnlyTheCurrentLocationAndSkipsTilesMissingFromTheMap()
        {
            _terrain.SetTile(new Vector3Int(-2, 3), Tile(TerrainType.Dirt, true));
            _terrain.SetTile(Vector3Int.zero, Tile(TerrainType.Dirt, true));
            BuildCache();
            GameState.World.Set(_location.id, "farmland:-2,3", new FarmlandState { plowed = true, irrigated = true });
            GameState.World.Set(_location.id, "farmland:99,99", new FarmlandState { plowed = true });
            GameState.World.Set("other:farm", "farmland:0,0", new FarmlandState { plowed = true, irrigated = true });
            Invoke(_map, "RestoreFarmlandState");
            var tile = _map.GetTileDataAtCoordinates(new Vector2Int(-2, 3));
            Assert.That(tile.FarmlandData.IsPlowed && tile.FarmlandData.IsIrrigated, Is.True);
            Assert.That(_plowed.GetTile(new Vector3Int(-2, 3)), Is.SameAs(_plowedTile));
            Assert.That(_irrigated.GetTile(new Vector3Int(-2, 3)), Is.SameAs(_irrigatedTile));
            Assert.That(_map.GetTileDataAtCoordinates(Vector2Int.zero).FarmlandData.IsPlowed, Is.False);
            Assert.That(_plowed.GetTile(new Vector3Int(99, 99)), Is.Null);
            Assert.That(GameState.World.GetStates<FarmlandState>().Count(), Is.EqualTo(3));
        }

        [Test]
        public void RestoreDoesNotPaintSavedFarmlandOntoNonfarmableTerrain()
        {
            _terrain.SetTile(Vector3Int.zero, Tile(TerrainType.Grass));
            BuildCache();
            GameState.World.Set(_location.id, "farmland:0,0", new FarmlandState { plowed = true, irrigated = true });
            Invoke(_map, "RestoreFarmlandState");
            Assert.That(_map.GetTileDataAtCoordinates(Vector2Int.zero).FarmlandData, Is.Null);
            Assert.That(_plowed.GetTile(Vector3Int.zero), Is.Null);
            Assert.That(_irrigated.GetTile(Vector3Int.zero), Is.Null);
        }

        [Test]
        public void RestoreDoesNotDisplayIrrigationWithoutPlowing()
        {
            _terrain.SetTile(Vector3Int.zero, Tile(TerrainType.Dirt, true));
            BuildCache();
            GameState.World.Set(_location.id, "farmland:0,0", new FarmlandState { irrigated = true });
            Invoke(_map, "RestoreFarmlandState");
            Assert.That(_map.GetTileDataAtCoordinates(Vector2Int.zero).FarmlandData.IsIrrigated, Is.False);
            Assert.That(_irrigated.GetTile(Vector3Int.zero), Is.Null);
        }

        [Test]
        public void SowingEventsForOtherLocationsDoNotTryToSpawnOnTheCurrentMap()
        {
            BuildCache();
            Assert.DoesNotThrow(() => _map.OnEvent(new SowPlantEvent
            {
                LocationId = "other:farm", Position = new Vector2Int(99, 99), PlantId = "test:crop"
            }));
        }

        [Test]
        public void NewDayConsumesIrrigationForGrowthThenClearsTheLoadedFarmlandOverlay()
        {
            _terrain.SetTile(Vector3Int.zero, Tile(TerrainType.Dirt, true));
            BuildCache();
            var tile = _map.GetTileDataAtCoordinates(Vector2Int.zero);
            _map.PlowTile(tile);
            _map.IrrigateTile(tile);
            var data = Asset<PlantData>();
            data.plantId = "test:crop";
            var catalog = Asset<PlantCatalog>();
            catalog.Synchronize(new Object[] { data });
            var plants = _root.AddComponent<PlantManager>();
            Set(plants, "_catalog", catalog);
            var plant = new PlantState(data.plantId);
            GameState.World.Set(_location.id, "plant:0,0", plant);
            Invoke(_map, "OnEnable");
            Invoke(plants, "OnEnable");
            try
            {
                NewDayEvent.Trigger(1);
                Assert.That(plant.daysPassedSincePlanting, Is.EqualTo(1));
                Assert.That(plant.consecutiveDaysWithoutWater, Is.Zero);
                Assert.That(tile.FarmlandData.IsPlowed, Is.True);
                Assert.That(tile.FarmlandData.IsIrrigated, Is.False);
                Assert.That(_irrigated.GetTile(Vector3Int.zero), Is.Null);
                Assert.That(_plowed.GetTile(Vector3Int.zero), Is.SameAs(_plowedTile));
                NewDayEvent.Trigger(2);
                Assert.That(plant.daysPassedSincePlanting, Is.EqualTo(1));
                Assert.That(plant.consecutiveDaysWithoutWater, Is.EqualTo(1));
            }
            finally
            {
                Invoke(plants, "OnDisable");
                Invoke(_map, "OnDisable");
            }
        }

        [Test]
        public void DryNotificationsRespectLocationsAndDoNotClearNewlyRewateredPlots()
        {
            _terrain.SetTile(Vector3Int.zero, Tile(TerrainType.Dirt, true));
            BuildCache();
            var tile = _map.GetTileDataAtCoordinates(Vector2Int.zero);
            _map.PlowTile(tile);
            _map.IrrigateTile(tile);
            _map.OnEvent(new FarmlandDriedEvent { LocationId = "other:farm", ObjectId = "farmland:0,0" });
            Assert.That(tile.FarmlandData.IsIrrigated, Is.True);
            _map.OnEvent(new FarmlandDriedEvent { LocationId = _location.id, ObjectId = "farmland:0,0" });
            Assert.That(tile.FarmlandData.IsIrrigated, Is.True);
            Assert.That(_irrigated.GetTile(Vector3Int.zero), Is.SameAs(_irrigatedTile));
        }

        private void AssertLand(bool plowed, bool irrigated)
        {
            Assert.That(GameState.World.TryGet(_location.id, "farmland:-2,3", out FarmlandState state), Is.True);
            Assert.That(state.plowed, Is.EqualTo(plowed));
            Assert.That(state.irrigated, Is.EqualTo(irrigated));
        }

        private Tilemap Tilemap(string name)
        {
            var go = new GameObject(name);
            go.transform.SetParent(_root.transform, false);
            return go.AddComponent<Tilemap>();
        }

        private VulcanusTile Tile(TerrainType type, bool farmable = false)
        {
            var tile = Asset<VulcanusTile>();
            tile.Configure(0, "test:tile", null, type, null, VulcanusCollisionKind.None);
            Set(tile, "isFarmable", farmable);
            return tile;
        }

        private T Asset<T>() where T : ScriptableObject
        {
            var asset = ScriptableObject.CreateInstance<T>();
            _assets.Add(asset);
            return asset;
        }

        private void BuildCache() => Invoke(_map, "BuildTileDataCache");
        private static void Invoke(object target, string name) => target.GetType()
            .GetMethod(name, BindingFlags.Instance | BindingFlags.NonPublic).Invoke(target, null);
        private static void Set(object target, string name, object value) => target.GetType()
            .GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(target, value);
    }
}

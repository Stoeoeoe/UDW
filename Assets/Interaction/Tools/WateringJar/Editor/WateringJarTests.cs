using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Character;
using Core.Common.Editor;
using Core.Context;
using Core.Inventory;
using Core.Location;
using Core.Tile;
using Core.Tile.Vulcanus;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.Tilemaps;
using TerrainData = Core.Tile.TerrainData;
using TileData = Core.Tile.TileData;
using static Core.Common.Editor.Reflect;
using InteractionMode = Core.Context.InteractionMode;
using Object = UnityEngine.Object;

namespace Interaction.Tools.WateringJar.Editor
{
    /// <summary>Checks saved water usage, fresh-water targeting, delayed refill and interruption.</summary>
    [Explicit("Uses the playable map and native Unity action delays.")]
    public sealed class WateringJarTests
    {
        private GameObject _root;
        private readonly List<Object> _assets = new();
        private MainCharacter _character;
        private WateringJarAction _jug;
        private MapManager _map;
        private Dictionary<Vector2Int, TileData> _tiles;
        private Vector2Int _front;
        private GameObject _gridRoot;
        private readonly Dictionary<string, object> _originalMapFields = new();

        [UnitySetUp]
        public IEnumerator SetUp()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/Maps/map-1.unity", OpenSceneMode.Single);
            yield return new EnterPlayMode();
            var deadline = Time.realtimeSinceStartup + 15f;
            while (!LiveGame.Get<LevelManager>() || !LiveGame.Get<LevelManager>().SceneReady)
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline), "The playable map must finish initialization.");
                yield return null;
            }
            _root = new GameObject("Water jug fixture");
            _root.SetActive(false);
            _map = LiveGame.Get<MapManager>();
            foreach (var field in new[] { "_terrainTilemap", "_irrigatedTilemap", "irrigatedFarmlandTile", "_tileDataCache", "_terrainDataByType" })
                _originalMapFields[field] = typeof(MapManager).GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).GetValue(_map);
            _character = LiveGame.Player;
            _character.MainInventory.Bind(new InventoryState());
            // Keep the real services and player, with isolated terrain to control the tested tool targets.
            _gridRoot = new GameObject("Grid", typeof(Grid));
            var terrain = new GameObject("Terrain", typeof(Tilemap));
            terrain.transform.SetParent(_gridRoot.transform);
            Set(_map, "_terrainTilemap", terrain.GetComponent<Tilemap>());
            Set(_map, "_irrigatedTilemap", terrain.GetComponent<Tilemap>());
            Set(_map, "irrigatedFarmlandTile", Own(ScriptableObject.CreateInstance<RuleTile>()));
            _tiles = new Dictionary<Vector2Int, TileData>();
            Set(_map, "_tileDataCache", _tiles);
            GameTestFixture.PlaceCharacterAtGroundPoint(_character, new Vector3(0.25f, 0.25f, 0));
            _character.Orientation.ForceDirection(Vector2.up);
            _character.Tiles.EnterLocation(_map);
            _front = new Vector2Int(0, 1);
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Interaction/Tools/WateringJar/WateringJarToolPrefab.prefab");
            _jug = Object.Instantiate(prefab, _root.transform).GetComponent<WateringJarAction>();
            _jug.Initialize(_character);
        }

        [UnityTearDown]
        public IEnumerator TearDown()
        {
            _character.PerformPrimaryAction.InterruptAction();
            // ExitPlayMode can render one final gameplay frame before its teardown starts.
            foreach (var field in _originalMapFields) Set(_map, field.Key, field.Value);
            _originalMapFields.Clear();
            _character.Tiles.EnterLocation(_map);
            Object.Destroy(_root);
            Object.Destroy(_gridRoot);
            foreach (var asset in _assets) Object.Destroy(asset);
            _assets.Clear();
            yield return new ExitPlayMode();
        }

        private T Own<T>(T asset) where T : Object { _assets.Add(asset); return asset; }

        [Test]
        public void StartsFullAndRebindingPreservesWaterAndUpgrades()
        {
            var state = new InventoryState();
            _character.MainInventory.Bind(state);
            Assert.That(_jug.Water.Current, Is.EqualTo(_jug.ToolData.maxCharge));
            _jug.Water.TryConsume(3);
            _jug.Water.IncreaseCapacity(10);
            _character.MainInventory.Bind(state);
            Assert.That(_jug.Water.Current, Is.EqualTo(_jug.ToolData.maxCharge - 3));
            Assert.That(_jug.Water.Capacity, Is.EqualTo(_jug.ToolData.maxCharge + 10));
        }

        [TestCase(0, 1, 0.25f, 0.25f)]
        [TestCase(1, 0, 0.95f, 0.95f)]
        [TestCase(0, -1, 0.25f, 0.01f)]
        [TestCase(-1, 0, 0.01f, 0.25f)]
        public async Task BareGroundPourSpendsResourcesAndHonoursCooldownThenPlowedGroundIsWatered(int dx, int dy, float x, float y)
        {
            GameTestFixture.PlaceCharacterAtGroundPoint(_character, new Vector3(x, y, 0));
            _character.Orientation.ForceDirection(new Vector2(dx, dy));
            var (executor, wrapper) = ToolLifecycle();
            var tool = _jug.ToolData;
            await Run(executor, wrapper);
            Assert.That(executor.IsIdle, Is.True, "Completed pours must release tool animation ownership.");
            Assert.That(executor.CurrentAction, Is.Null);
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(_jug.Water.Current, Is.EqualTo(tool.maxCharge - tool.chargePerUsage));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100 - tool.staminaCost));

            var expectedTarget = new Vector2Int(Mathf.FloorToInt(x) + dx, Mathf.FloorToInt(y) + dy);
            var land = Tile("dirt", true, expectedTarget);
            await Run(executor, wrapper);
            Assert.That(land.FarmlandData.IsIrrigated, Is.True);
            Assert.That(_jug.Water.Current, Is.EqualTo(tool.maxCharge - 2 * tool.chargePerUsage));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100 - 2 * tool.staminaCost));
            Assert.That(executor.IsIdle, Is.True);
            Assert.That(_character.IsControlBlocked, Is.False);

            await Run(executor, wrapper);
            Assert.That(land.FarmlandData.IsIrrigated, Is.True);
            Assert.That(_jug.Water.Current, Is.EqualTo(tool.maxCharge - 3 * tool.chargePerUsage), "Already-wet ground still receives a pour.");
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100 - 3 * tool.staminaCost));

            await Run(executor, wrapper, () => _jug.Water.Current = 0, expectExecution: false);
            Assert.That(executor.IsIdle, Is.True, "A rejection after preparation must reset the action.");
            Assert.That(executor.CurrentAction, Is.Null);
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100 - 3 * tool.staminaCost));
        }

        private (ActionExecutor executor, UseToolAction wrapper) ToolLifecycle()
        {
            var tool = _jug.ToolData;
            _character.MainInventory.AddItem(tool, 1);
            _character.Loadout.SelectItem(0);
            _jug = (WateringJarAction)_character.ToolActionRegistry.GetToolAction(tool);
            var wrapper = Object.Instantiate(
                AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Interaction/Tools/UseToolActionPrefab.prefab"), _root.transform)
                .GetComponent<UseToolAction>();
            wrapper.Initialize(_character);
            var snapshot = PlayerInteractionContextSnapshot.Empty() with
            {
                SceneReady = true, Character = _character, CurrentTool = tool, CurrentlyHeldItem = tool, Mode = InteractionMode.Tool
            };
            var executor = new ActionExecutor(_character, () => snapshot);
            return (executor, wrapper);
        }

        private static async Task Run(ActionExecutor executor, AbstractAction action, Action beforeRelease = null, bool expectExecution = true)
        {
            var sawCooldown = false;
            void ObserveCooldown()
            {
                if (executor.State != ActionExecutionState.Cooldown) return;
                sawCooldown = true;
                Assert.That(executor.IsIdle, Is.False);
                Assert.That(action.Owner.IsControlBlocked, Is.False);
                executor.RunAsync(action).GetAwaiter().GetResult();
            }
            executor.StateChanged += ObserveCooldown;
            try
            {
                var run = executor.RunAsync(action);
                if (executor.State == ActionExecutionState.Preparing)
                {
                    beforeRelease?.Invoke();
                    executor.ContinueFromPrepare();
                }
                Assert.That(!executor.IsIdle, Is.EqualTo(expectExecution), "Only executed pours wait for their authored duration.");
                if (expectExecution)
                {
                    var tool = ((UseToolAction)action).CurrentTool;
                    var water = action.Owner.Loadout.GetToolCharge(tool).Current;
                    var stamina = action.Owner.Stamina.CurrentStamina;
                    await executor.RunAsync(action);
                    Assert.That(action.Owner.Loadout.GetToolCharge(tool).Current, Is.EqualTo(water));
                    Assert.That(action.Owner.Stamina.CurrentStamina, Is.EqualTo(stamina));
                }
                await run;
                Assert.That(sawCooldown, Is.EqualTo(expectExecution));
            }
            finally
            {
                executor.StateChanged -= ObserveCooldown;
                executor.InterruptCurrentAction();
            }
        }

        [TestCase(0, 1, 0.25f, 0.25f)]
        [TestCase(0, 1, 0.25f, 0.95f)]
        [TestCase(1, 0, 0.25f, 0.25f)]
        [TestCase(1, 0, 0.95f, 0.25f)]
        [TestCase(0, -1, 0.25f, 0.95f)]
        [TestCase(0, -1, 0.25f, 0.01f)]
        [TestCase(-1, 0, 0.95f, 0.25f)]
        [TestCase(-1, 0, 0.01f, 0.25f)]
        public async Task AdjacentWaterRefillsThroughTheFullLifecycleAtEitherEdgeOfTheStandingCell(int dx, int dy, float x, float y)
        {
            GameTestFixture.PlaceCharacterAtGroundPoint(_character, new Vector3(x, y, 0));
            _character.Orientation.ForceDirection(new Vector2(dx, dy));
            var target = Tile("fresh_water", coordinates: new Vector2Int(dx, dy));
            var (executor, wrapper) = ToolLifecycle();
            _jug.Water.Current = 0;
            _jug.Water.IncreaseCapacity(10);

            Assert.That(_character.Tiles.InFront, Is.SameAs(target));
            Assert.That(_jug.GetActionExecutionLocation(null), Is.EqualTo(target.WorldPosition));
            await Run(executor, wrapper);

            Assert.That(_jug.Water.Current, Is.EqualTo(_jug.Water.Capacity));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100));
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(executor.IsIdle, Is.True);
            Assert.That(_jug.gameObject.activeSelf, Is.False);

            // A full jug rejects another refill without taking ownership or spending resources.
            await Run(executor, wrapper, expectExecution: false);
            Assert.That(_jug.Water.Current, Is.EqualTo(_jug.Water.Capacity));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100));
            Assert.That(_character.IsControlBlocked, Is.False);
        }

        [Test]
        public async Task InterruptingTheExecutingRefillReleasesControlsAndAllowsAnotherAttempt()
        {
            Tile("fresh_water");
            var (executor, wrapper) = ToolLifecycle();
            _jug.Water.Current = 2;
            var run = executor.RunAsync(wrapper);
            executor.ContinueFromPrepare();
            Assert.That(executor.State, Is.EqualTo(ActionExecutionState.Executing));
            Assert.That(_jug.Water.Current, Is.EqualTo(2), "Water is granted only after the refill delay.");
            executor.InterruptCurrentAction();
            await run;

            Assert.That(executor.IsIdle, Is.True);
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(_jug.gameObject.activeSelf, Is.False);
            Assert.That(_jug.Water.Current, Is.EqualTo(2));
            await Run(executor, wrapper);
            Assert.That(_jug.Water.Current, Is.EqualTo(_jug.Water.Capacity));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100));
        }

        [Test]
        public async Task CapturedRefillUsesTheSameTargetForFeedbackCostAndExecution()
        {
            var water = Tile("fresh_water");
            var (_, wrapper) = ToolLifecycle();
            _jug.Water.Current = 2;
            var snapshot = PlayerInteractionContextSnapshot.Empty() with { SceneReady = true, Character = _character };
            Assert.That(wrapper.CanExecute(snapshot), Is.True);
            Assert.That(wrapper.CanExecuteAfterPreparation(snapshot), Is.True);
            var feedback = _jug.ExecuteFeedback;

            // Presentation callbacks must not change the operation chosen on release.
            _character.Orientation.ForceDirection(Vector2.down);
            Assert.That(_jug.IsRefilling, Is.True);
            Assert.That(_jug.StaminaCost, Is.Zero);
            Assert.That(_jug.ExecuteFeedback, Is.SameAs(feedback));
            Assert.That(_jug.GetActionExecutionLocation(snapshot), Is.EqualTo(water.WorldPosition));
            await _jug.OnExecute(snapshot, CancellationToken.None);
            Assert.That(_jug.Water.Current, Is.EqualTo(_jug.Water.Capacity));

            wrapper.OnEnd(snapshot);
            Assert.That(_jug.IsRefilling, Is.False, "Ending the attempt releases its captured target.");
        }

        [TestCase(true)]
        [TestCase(false)]
        public async Task PreparationReleaseCapturesTheFinalAimForBothRefillAndWatering(bool finishFacingWater)
        {
            Tile("fresh_water");
            var soil = Tile("dirt", true, new Vector2Int(0, -1));
            _character.Orientation.ForceDirection(finishFacingWater ? Vector2.down : Vector2.up);
            var (executor, wrapper) = ToolLifecycle();
            _jug.Water.Current = 4;

            await Run(executor, wrapper, () => _character.Orientation.ForceDirection(finishFacingWater ? Vector2.up : Vector2.down));

            Assert.That(_jug.Water.Current, Is.EqualTo(finishFacingWater ? _jug.Water.Capacity : 4 - _jug.ToolData.chargePerUsage));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(finishFacingWater ? 100 : 100 - _jug.ToolData.staminaCost));
            Assert.That(soil.FarmlandData.IsIrrigated, Is.EqualTo(!finishFacingWater));
            Assert.That(executor.IsIdle, Is.True);
            Assert.That(_character.IsControlBlocked, Is.False);
        }

        [Test]
        public async Task WateringSpendsPerTileAndStopsWhenEmpty()
        {
            var first = Tile("dirt", true);
            var second = Tile("dirt", true, _front + Vector2Int.right);
            _jug.Water.Current = _jug.ToolData.chargePerUsage;
            Set(typeof(ToolAction), _jug, "_capturedAffectedTiles", new List<TileData> { first, second });
            await _jug.OnExecute(null, CancellationToken.None);
            Assert.That(first.FarmlandData.IsIrrigated, Is.True);
            Assert.That(second.FarmlandData.IsIrrigated, Is.False);
            Assert.That(_jug.Water.Current, Is.Zero);
            Assert.That(_jug.CanExecute(null), Is.False);
        }

        [Test]
        public async Task InterruptedPourDoesNotSpendWaterOrIrrigateTheNextTile()
        {
            var first = Tile("dirt", true);
            var second = Tile("dirt", true, _front + Vector2Int.right);
            var initialWater = _jug.Water.Current;
            Set(typeof(ToolAction), _jug, "_capturedAffectedTiles", new List<TileData> { first, second });
            using var cancellation = new CancellationTokenSource();
            var run = _jug.OnExecute(null, cancellation.Token);
            Assert.That(first.FarmlandData.IsIrrigated, Is.True);
            Assert.That(second.FarmlandData.IsIrrigated, Is.False);
            cancellation.Cancel();
            try { await run; Assert.Fail("The remaining pour must be cancelled."); }
            catch (OperationCanceledException) { }
            Assert.That(second.FarmlandData.IsIrrigated, Is.False);
            Assert.That(_jug.Water.Current, Is.EqualTo(initialWater - _jug.ToolData.chargePerUsage));
        }

        [Test]
        public async Task RefillCompletesAfterTheFeedbackDelayAndUsesUpgradedCapacity()
        {
            Tile("fresh_water");
            _jug.Water.Current = 0;
            _jug.Water.IncreaseCapacity(10);
            Assert.That(_jug.CanExecute(null), Is.True);
            Assert.That(_jug.StaminaCost, Is.Zero);
            Assert.That(_jug.ExecuteFeedback, Is.Not.Null);
            var run = _jug.OnExecute(null, CancellationToken.None);
            Assert.That(run.GetAwaiter().IsCompleted, Is.False);
            Assert.That(_jug.Water.Current, Is.Zero);
            await run;
            Assert.That(_jug.Water.Current, Is.EqualTo(_jug.Water.Capacity));
            Assert.That(_jug.CanExecute(null), Is.False, "A full jug does not start another refill.");
        }

        [Test]
        public async Task InterruptedRefillDoesNotGrantWater()
        {
            Tile("fresh_water");
            _jug.Water.Current = 2;
            using var cancellation = new CancellationTokenSource();
            var run = _jug.OnExecute(null, cancellation.Token);
            cancellation.Cancel();
            try { await run; Assert.Fail("The refill must be cancelled."); }
            catch (OperationCanceledException) { }
            Assert.That(_jug.Water.Current, Is.EqualTo(2));
        }

        [TestCase(false)]
        [TestCase(true)]
        public async Task RefillUsesCachedFreshwaterFromTerrainOrAVisualLayer(bool visualLayer)
        {
            var water = (VulcanusTile)Tile("fresh_water").TilemapTile;
            var grass = Own(ScriptableObject.CreateInstance<VulcanusTile>());
            grass.Configure(1, "test:grass", "grass", TerrainType.Grass, Array.Empty<string>(), VulcanusCollisionKind.None);
            var grassData = Own(ScriptableObject.CreateInstance<TerrainData>());
            var waterData = Own(ScriptableObject.CreateInstance<TerrainData>());
            Set(grassData, "terrainType", TerrainType.Grass);
            Set(waterData, "terrainType", TerrainType.Water);
            Set(_map, "_terrainDataByType", new Dictionary<TerrainType, TerrainData>(
                (Dictionary<TerrainType, TerrainData>)_originalMapFields["_terrainDataByType"])
                { [TerrainType.Grass] = grassData, [TerrainType.Water] = waterData });
            var terrain = (Tilemap)typeof(MapManager).GetField("_terrainTilemap", BindingFlags.Instance | BindingFlags.NonPublic)
                .GetValue(_map);
            var cell = new Vector3Int(_front.x, _front.y, 0);
            terrain.SetTile(cell, visualLayer ? grass : water);
            if (visualLayer)
            {
                var layer = new GameObject("Water", typeof(Tilemap));
                layer.transform.SetParent(terrain.transform.parent, false);
                layer.GetComponent<Tilemap>().SetTile(cell, water);
            }
            Call(_map, "BuildTileDataCache");

            _jug.Water.Current = 0;
            Assert.That(_jug.IsRefilling, Is.True);
            Assert.That(_jug.CanExecute(null), Is.True);
            Assert.That(_jug.StaminaCost, Is.Zero);
            await _jug.OnExecute(null, CancellationToken.None);
            Assert.That(_jug.Water.Current, Is.EqualTo(_jug.Water.Capacity));
            Assert.That(_map.GetTileDataAtCoordinates(_front).TilemapTile, Is.SameAs(visualLayer ? grass : water));
        }

        [Test]
        public void WaterAwayFromTheFacingTileDoesNotRefillAndSaltWaterIsRejected()
        {
            Tile("fresh_water", false, _front + Vector2Int.right);
            Tile("water");
            _jug.Water.Current = 0;
            Assert.That(_jug.IsRefilling, Is.False);
            Assert.That(_jug.CanExecute(null), Is.False);
        }

        [TestCase("true", true)]
        [TestCase("false", false)]
        [TestCase(null, false)]
        public void FreshwaterRequiresTheBooleanMetadataProperty(string value, bool expected)
        {
            var tile = Tile("water");
            var definition = (VulcanusTile)tile.TilemapTile;
            Set(definition, "properties", value == null ? Array.Empty<VulcanusTile.VulcanusTileProperty>() :
                new[] { new VulcanusTile.VulcanusTileProperty { key = "isFreshwater", jsonValue = value } });
            Assert.That(definition.IsFreshwater, Is.EqualTo(expected));
        }

        private TileData Tile(string terrain, bool farmable = false, Vector2Int? coordinates = null)
        {
            var at = coordinates ?? _front;
            var definition = Own(ScriptableObject.CreateInstance<VulcanusTile>());
            definition.Configure(0, "test:tile", terrain, TerrainType.Water, Array.Empty<string>(), VulcanusCollisionKind.None);
            if (terrain == "fresh_water")
                Set(definition, "properties", new[] { new VulcanusTile.VulcanusTileProperty { key = "isFreshwater", jsonValue = "true" } });
            var data = Own(ScriptableObject.CreateInstance<TerrainData>());
            var tile = new TileData(definition, at.x, at.y, data, Vector3.zero, farmable,
                isFreshwater: definition.IsFreshwater);
            if (farmable) tile.TryPlow();
            _tiles[at] = tile;
            return tile;
        }

    }
}

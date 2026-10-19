using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using Character;
using Core;
using Core.Common.Editor;
using Core.Context;
using Core.Game;
using Core.Inventory;
using Core.Location;
using Core.Tile;
using Core.Tile.Vulcanus;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Tilemaps;
using TerrainData = Core.Tile.TerrainData;
using TileData = Core.Tile.TileData;

namespace Interaction.Tools.WateringJar.Editor
{
    /// <summary>Checks saved water usage, fresh-water targeting, delayed refill and interruption.</summary>
    public sealed class WateringJarTests
    {
        private GameTestFixture _fixture;
        private MainCharacter _character;
        private WateringJarAction _jug;
        private MapManager _map;
        private Dictionary<Vector2Int, TileData> _tiles;
        private Vector2Int _front;
        private GameObject _gridRoot;

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Water jug");
            _fixture.AddSingleton<GameStateManager>();
            var level = _fixture.RegisterSingleton<LevelManager>();
            var location = _fixture.Own(ScriptableObject.CreateInstance<LocationData>());
            location.id = "test:jug";
            Set(level, "<CurrentLocationData>k__BackingField", location);
            _map = _fixture.AddSingleton<MapManager>(map => Set(map, "tileDataTypes", Array.Empty<TerrainData>()));
            // Cell conversion and layoutGrid require an active Grid, independently of the inactive managers.
            _gridRoot = new GameObject("Grid", typeof(Grid));
            var terrain = new GameObject("Terrain", typeof(Tilemap));
            terrain.transform.SetParent(_gridRoot.transform);
            Set(_map, "_terrainTilemap", terrain.GetComponent<Tilemap>());
            Set(_map, "_irrigatedTilemap", terrain.GetComponent<Tilemap>());
            Set(_map, "irrigatedFarmlandTile", _fixture.Own(ScriptableObject.CreateInstance<RuleTile>()));
            _tiles = new Dictionary<Vector2Int, TileData>();
            Set(_map, "_tileDataCache", _tiles);
            _character = _fixture.CreateCharacter();
            GameTestFixture.PlaceCharacterAtGroundPoint(_character, new Vector3(0.25f, 0.25f, 0));
            _character.Orientation.ForceDirection(Vector2.up);
            _character.Tiles.EnterLocation(_map);
            _front = new Vector2Int(0, 1);
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Interaction/Tools/WateringJar/WateringJarToolPrefab.prefab");
            var root = UnityEngine.Object.Instantiate(prefab, _fixture.Root.transform);
            _jug = root.GetComponent<WateringJarAction>();
            _jug.Initialize(_character);
        }

        [TearDown]
        public void TearDown()
        {
            _fixture.Dispose();
            UnityEngine.Object.DestroyImmediate(_gridRoot);
        }

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
        public void BareGroundPourSpendsResourcesAndHonoursCooldownThenPlowedGroundIsWatered(int dx, int dy, float x, float y)
        {
            GameTestFixture.PlaceCharacterAtGroundPoint(_character, new Vector3(x, y, 0));
            _character.Orientation.ForceDirection(new Vector2(dx, dy));
            var (executor, wrapper) = ToolLifecycle();
            var tool = _jug.ToolData;
            Run(executor, wrapper);
            Assert.That(executor.IsIdle, Is.True, "Completed pours must release tool animation ownership.");
            Assert.That(executor.CurrentAction, Is.Null);
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(_jug.Water.Current, Is.EqualTo(tool.maxCharge - tool.chargePerUsage));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100 - tool.staminaCost));

            var expectedTarget = new Vector2Int(Mathf.FloorToInt(x) + dx, Mathf.FloorToInt(y) + dy);
            var land = Tile("dirt", true, expectedTarget);
            Run(executor, wrapper);
            Assert.That(land.FarmlandData.IsIrrigated, Is.True);
            Assert.That(_jug.Water.Current, Is.EqualTo(tool.maxCharge - 2 * tool.chargePerUsage));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100 - 2 * tool.staminaCost));
            Assert.That(executor.IsIdle, Is.True);
            Assert.That(_character.IsControlBlocked, Is.False);

            Run(executor, wrapper);
            Assert.That(land.FarmlandData.IsIrrigated, Is.True);
            Assert.That(_jug.Water.Current, Is.EqualTo(tool.maxCharge - 3 * tool.chargePerUsage), "Already-wet ground still receives a pour.");
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100 - 3 * tool.staminaCost));

            Run(executor, wrapper, () => _jug.Water.Current = 0, expectExecution: false);
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
            _character.ToolActionRegistry.Initialize(_character);
            _jug = (WateringJarAction)_character.ToolActionRegistry.GetToolAction(tool);
            var wrapper = UnityEngine.Object.Instantiate(
                AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Interaction/Tools/UseToolActionPrefab.prefab"), _fixture.Root.transform)
                .GetComponent<UseToolAction>();
            wrapper.Initialize(_character);
            var snapshot = PlayerInteractionContextSnapshot.Empty() with
            {
                SceneReady = true, Character = _character, CurrentTool = tool, CurrentlyHeldItem = tool, Mode = Core.Context.InteractionMode.Tool
            };
            var executor = new ActionExecutor(_character, () => snapshot);
            return (executor, wrapper);
        }

        private static void Run(ActionExecutor executor, AbstractAction action, Action beforeRelease = null, bool expectExecution = true)
        {
            var steps = new Stack<IEnumerator>();
            var sawExecutionWait = false;
            var sawCooldownWait = false;
            steps.Push(executor.Run(action));
            while (steps.Count > 0)
            {
                var step = steps.Peek();
                if (!step.MoveNext()) { steps.Pop(); continue; }
                if (step.Current is WaitUntil && executor.State == ActionExecutionState.Preparing)
                {
                    beforeRelease?.Invoke();
                    executor.ContinueFromPrepare();
                }
                if (step.Current is WaitForSeconds)
                {
                    sawExecutionWait |= executor.State == ActionExecutionState.Executing;
                    sawCooldownWait |= executor.State == ActionExecutionState.Cooldown;
                    var tool = ((UseToolAction)action).CurrentTool;
                    var water = action.Owner.Loadout.GetToolCharge(tool).Current;
                    var stamina = action.Owner.Stamina.CurrentStamina;
                    Assert.That(executor.Run(action).MoveNext(), Is.False, "Repeated input cannot start another pour during execution or cooldown.");
                    Assert.That(action.Owner.Loadout.GetToolCharge(tool).Current, Is.EqualTo(water));
                    Assert.That(action.Owner.Stamina.CurrentStamina, Is.EqualTo(stamina));
                }
                if (step.Current is IEnumerator nested) steps.Push(nested);
            }
            Assert.That(sawExecutionWait, Is.EqualTo(expectExecution), "Only executed pours run the authored action duration.");
            Assert.That(sawCooldownWait, Is.EqualTo(expectExecution), "Only executed pours run the authored cooldown.");
        }

        [TestCase(0, 1, 0.25f, 0.25f)]
        [TestCase(0, 1, 0.25f, 0.95f)]
        [TestCase(1, 0, 0.25f, 0.25f)]
        [TestCase(1, 0, 0.95f, 0.25f)]
        [TestCase(0, -1, 0.25f, 0.95f)]
        [TestCase(0, -1, 0.25f, 0.01f)]
        [TestCase(-1, 0, 0.95f, 0.25f)]
        [TestCase(-1, 0, 0.01f, 0.25f)]
        public void AdjacentWaterRefillsThroughTheFullLifecycleAtEitherEdgeOfTheStandingCell(int dx, int dy, float x, float y)
        {
            GameTestFixture.PlaceCharacterAtGroundPoint(_character, new Vector3(x, y, 0));
            _character.Orientation.ForceDirection(new Vector2(dx, dy));
            var target = Tile("fresh_water", coordinates: new Vector2Int(dx, dy));
            var (executor, wrapper) = ToolLifecycle();
            _jug.Water.Current = 0;
            _jug.Water.IncreaseCapacity(10);

            Assert.That(_character.Tiles.InFront, Is.SameAs(target));
            Assert.That(_jug.GetActionExecutionLocation(null), Is.EqualTo(target.WorldPosition));
            Run(executor, wrapper);

            Assert.That(_jug.Water.Current, Is.EqualTo(_jug.Water.Capacity));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100));
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(executor.IsIdle, Is.True);
            Assert.That(_jug.gameObject.activeSelf, Is.False);

            // A full jug rejects another refill without taking ownership or spending resources.
            Run(executor, wrapper, expectExecution: false);
            Assert.That(_jug.Water.Current, Is.EqualTo(_jug.Water.Capacity));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100));
            Assert.That(_character.IsControlBlocked, Is.False);
        }

        [Test]
        public void InterruptingTheExecutingRefillReleasesControlsAndAllowsAnotherAttempt()
        {
            Tile("fresh_water");
            var (executor, wrapper) = ToolLifecycle();
            _jug.Water.Current = 2;
            var steps = new Stack<IEnumerator>();
            steps.Push(executor.Run(wrapper));
            var waitingToRefill = false;
            while (steps.Count > 0)
            {
                var step = steps.Peek();
                if (!step.MoveNext()) { steps.Pop(); continue; }
                if (step.Current is WaitUntil && executor.State == ActionExecutionState.Preparing)
                    executor.ContinueFromPrepare();
                if (step.Current is WaitForSeconds && executor.State == ActionExecutionState.Executing)
                {
                    waitingToRefill = true;
                    break;
                }
                if (step.Current is IEnumerator nested) steps.Push(nested);
            }
            Assert.That(waitingToRefill, Is.True);
            Assert.That(_jug.Water.Current, Is.EqualTo(2), "Water is granted only after the refill delay.");
            executor.InterruptCurrentAction();
            while (steps.Count > 0) ((IDisposable)steps.Pop()).Dispose();

            Assert.That(executor.IsIdle, Is.True);
            Assert.That(_character.IsControlBlocked, Is.False);
            Assert.That(_jug.gameObject.activeSelf, Is.False);
            Assert.That(_jug.Water.Current, Is.EqualTo(2));
            Run(executor, wrapper);
            Assert.That(_jug.Water.Current, Is.EqualTo(_jug.Water.Capacity));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100));
        }

        [Test]
        public void CapturedRefillUsesTheSameTargetForFeedbackCostAndExecution()
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
            var routine = _jug.OnExecute(snapshot);
            Assert.That(routine.MoveNext(), Is.True);
            Assert.That(routine.MoveNext(), Is.False);
            Assert.That(_jug.Water.Current, Is.EqualTo(_jug.Water.Capacity));

            wrapper.OnEnd(snapshot);
            Assert.That(_jug.IsRefilling, Is.False, "Ending the attempt releases its captured target.");
        }

        [TestCase(true)]
        [TestCase(false)]
        public void PreparationReleaseCapturesTheFinalAimForBothRefillAndWatering(bool finishFacingWater)
        {
            Tile("fresh_water");
            var soil = Tile("dirt", true, new Vector2Int(0, -1));
            _character.Orientation.ForceDirection(finishFacingWater ? Vector2.down : Vector2.up);
            var (executor, wrapper) = ToolLifecycle();
            _jug.Water.Current = 4;

            Run(executor, wrapper, () => _character.Orientation.ForceDirection(finishFacingWater ? Vector2.up : Vector2.down));

            Assert.That(_jug.Water.Current, Is.EqualTo(finishFacingWater ? _jug.Water.Capacity : 4 - _jug.ToolData.chargePerUsage));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(finishFacingWater ? 100 : 100 - _jug.ToolData.staminaCost));
            Assert.That(soil.FarmlandData.IsIrrigated, Is.EqualTo(!finishFacingWater));
            Assert.That(executor.IsIdle, Is.True);
            Assert.That(_character.IsControlBlocked, Is.False);
        }

        [Test]
        public void WateringSpendsPerTileAndStopsWhenEmpty()
        {
            var first = Tile("dirt", true);
            var second = Tile("dirt", true, _front + Vector2Int.right);
            _jug.Water.Current = _jug.ToolData.chargePerUsage;
            Set(typeof(ToolAction), _jug, "_capturedAffectedTiles", new List<TileData> { first, second });
            var routine = _jug.OnExecute(null);
            while (routine.MoveNext()) { }
            Assert.That(first.FarmlandData.IsIrrigated, Is.True);
            Assert.That(second.FarmlandData.IsIrrigated, Is.False);
            Assert.That(_jug.Water.Current, Is.Zero);
            Assert.That(_jug.CanExecute(null), Is.False);
        }

        [Test]
        public void RefillCompletesAfterTheFeedbackDelayAndUsesUpgradedCapacity()
        {
            Tile("fresh_water");
            _jug.Water.Current = 0;
            _jug.Water.IncreaseCapacity(10);
            Assert.That(_jug.CanExecute(null), Is.True);
            Assert.That(_jug.StaminaCost, Is.Zero);
            Assert.That(_jug.ExecuteFeedback, Is.Not.Null);
            var routine = _jug.OnExecute(null);
            Assert.That(routine.MoveNext(), Is.True);
            Assert.That(routine.Current, Is.TypeOf<WaitForSeconds>());
            Assert.That(_jug.Water.Current, Is.Zero);
            Assert.That(routine.MoveNext(), Is.False);
            Assert.That(_jug.Water.Current, Is.EqualTo(_jug.Water.Capacity));
            Assert.That(_jug.CanExecute(null), Is.False, "A full jug does not start another refill.");
        }

        [Test]
        public void InterruptedRefillDoesNotGrantWater()
        {
            Tile("fresh_water");
            _jug.Water.Current = 2;
            var routine = _jug.OnExecute(null);
            routine.MoveNext();
            ((IDisposable)routine).Dispose();
            Assert.That(_jug.Water.Current, Is.EqualTo(2));
        }

        [TestCase(false)]
        [TestCase(true)]
        public void RefillUsesCachedFreshwaterFromTerrainOrAVisualLayer(bool visualLayer)
        {
            var water = (VulcanusTile)Tile("fresh_water").TilemapTile;
            var grass = _fixture.Own(ScriptableObject.CreateInstance<VulcanusTile>());
            grass.Configure(1, "test:grass", "grass", TerrainType.Grass, Array.Empty<string>(), VulcanusCollisionKind.None);
            var grassData = _fixture.Own(ScriptableObject.CreateInstance<TerrainData>());
            var waterData = _fixture.Own(ScriptableObject.CreateInstance<TerrainData>());
            Set(grassData, "terrainType", TerrainType.Grass);
            Set(waterData, "terrainType", TerrainType.Water);
            Set(_map, "_terrainDataByType", new Dictionary<TerrainType, TerrainData>
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
            typeof(MapManager).GetMethod("BuildTileDataCache", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(_map, null);

            _jug.Water.Current = 0;
            Assert.That(_jug.IsRefilling, Is.True);
            Assert.That(_jug.CanExecute(null), Is.True);
            Assert.That(_jug.StaminaCost, Is.Zero);
            var routine = _jug.OnExecute(null);
            Assert.That(routine.MoveNext(), Is.True);
            Assert.That(routine.MoveNext(), Is.False);
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
            var definition = _fixture.Own(ScriptableObject.CreateInstance<VulcanusTile>());
            definition.Configure(0, "test:tile", terrain, TerrainType.Water, Array.Empty<string>(), VulcanusCollisionKind.None);
            if (terrain == "fresh_water")
                Set(definition, "properties", new[] { new VulcanusTile.VulcanusTileProperty { key = "isFreshwater", jsonValue = "true" } });
            var data = _fixture.Own(ScriptableObject.CreateInstance<TerrainData>());
            var tile = new TileData(definition, at.x, at.y, data, Vector3.zero, farmable,
                isFreshwater: definition.IsFreshwater);
            if (farmable) tile.TryPlow();
            _tiles[at] = tile;
            return tile;
        }

        private static void Set(object target, string field, object value) => Set(target.GetType(), target, field, value);
        private static void Set(Type type, object target, string field, object value) =>
            type.GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(target, value);
    }
}

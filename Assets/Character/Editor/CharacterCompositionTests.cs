using System;
using System.Collections.Generic;
using System.Reflection;
using Core.Common.Editor;
using Core.Inventory;
using Core.Tile;
using Interaction.Tools;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Tilemaps;
using TileData = Core.Tile.TileData;

namespace Character.Editor
{
    public sealed class CharacterCompositionTests
    {
        private GameTestFixture _fixture;
        private MainCharacter _character;

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Character composition");
            _character = _fixture.CreateCharacter();
        }

        [TearDown] public void TearDown() => _fixture.Dispose();

        [Test]
        public void AuthoredPrefabSatisfiesCompositionContract()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Character/Player/TestCharacter.prefab");
            Assert.That(CharacterConfigurationValidation.Check(prefab), Is.Empty);
            Assert.That(_character.MainInventory.transform.IsChildOf(_character.transform), Is.True);
        }

        [Test]
        public void MissingInventoryFailsAtConfigurationBoundary()
        {
            typeof(GameCharacter).GetProperty(nameof(GameCharacter.MainInventory)).SetValue(_character, null);
            Assert.Throws<InvalidOperationException>(_character.ValidateConfiguration);
        }

        [Test]
        public void CharacterSelectionFollowsLoadoutWithoutSelectionEventCopies()
        {
            var tool = _fixture.Own(ScriptableObject.CreateInstance<ToolData>());
            typeof(ItemDefinition).GetField("_itemId", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(tool, "test:selection");
            _character.MainInventory.AddItem(tool, 1);
            _character.Loadout.SelectItem(0);
            _character.MainInventory.MoveItem(0, 2);
            Assert.That(_character.CurrentTool, Is.SameAs(tool));
            Assert.That(_character.CurrentSelectedSlotIndex, Is.EqualTo(2));
            _character.MainInventory.RemoveItemAt(2);
            Assert.That(_character.CurrentlyHeldItem, Is.Null);
            Assert.That(_character.CurrentSelectedSlotIndex, Is.EqualTo(-1));
        }

        [Test]
        public void MaximumStaminaChangesClampTheBoundResourceAndRebindingDoesNotDuplicateSubscriptions()
        {
            var stamina = _character.Stamina;
            var state = new StaminaState { Initialized = true, Current = 90 };
            stamina.Initialize(state);
            stamina.Initialize(state);
            _character.Attributes.SetModifier(CharacterAttributeType.MaxStamina, "test:penalty", -50);
            Assert.That(stamina.CurrentStamina, Is.EqualTo(50));
            _character.Attributes.RemoveModifier(CharacterAttributeType.MaxStamina, "test:penalty");
            Assert.That(stamina.MaxStamina, Is.EqualTo(100));
            Assert.That(stamina.CurrentStamina, Is.EqualTo(50));
        }

        [Test]
        public void IndependentControlOwnersCannotReleaseEachOtherOrChangeDeath()
        {
            var action = new object();
            var transition = new object();
            _character.SetControlBlocked(action, true);
            _character.SetControlBlocked(transition, true);
            _character.SetControlBlocked(action, false);
            Assert.That(_character.IsControlBlocked, Is.True);
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Normal));
            _character.SetConditionState(ConditionState.Dead);
            _character.SetControlBlocked(transition, false);
            Assert.That(_character.ConditionState, Is.EqualTo(ConditionState.Dead));
            Assert.That(_character.IsControlBlocked, Is.True);
        }

        [Test]
        public void StationaryEntryPlacementAndForcedFacingUseTheCurrentMap()
        {
            _fixture.Root.SetActive(true); // Grid needs an active hierarchy to initialize its cell conversion.
            var map = _fixture.RegisterSingleton<MapManager>();
            var grid = new GameObject("Grid", typeof(Grid));
            grid.transform.SetParent(_fixture.Root.transform);
            var tileRoot = new GameObject("Tiles", typeof(Tilemap));
            tileRoot.transform.SetParent(grid.transform);
            var tilemap = tileRoot.GetComponent<Tilemap>();
            var tiles = new Dictionary<Vector2Int, TileData>();
            var terrain = _fixture.Own(ScriptableObject.CreateInstance<Core.Tile.TerrainData>());
            for (var x = -3; x <= 3; x++)
                for (var y = -3; y <= 3; y++)
                    tiles.Add(new Vector2Int(x, y), new TileData(null, x, y, terrain, tilemap.GetCellCenterWorld(new Vector3Int(x, y, 0))));
            Set(map, "_terrainTilemap", tilemap);
            Set(map, "_tileDataCache", tiles);
            _character.ToolInteractionAnchor.position = new Vector3(0.25f, 0.25f, 0);
            _character.SetMovementState(MovementState.Idle);
            _character.Tiles.EnterLocation(map);
            Assert.That(_character.Tiles.Current, Is.SameAs(tiles[Vector2Int.zero]));
            _character.ToolInteractionAnchor.position += Vector3.right;
            _character.Tiles.OnPlaced();
            Assert.That(_character.Tiles.Current, Is.SameAs(tiles[Vector2Int.right]));
            _character.Orientation.ForceDirection(Vector2.up);
            Assert.That(_character.Tiles.InFront, Is.SameAs(tiles[new Vector2Int(1, 1)]));
            _character.Tiles.LeaveLocation();
            Assert.That(_character.Tiles.Current, Is.Null);
        }

        private static void Set(object target, string name, object value) =>
            target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(target, value);
    }
}

using System;
using System.Reflection;
using Character;
using Core.Common.Editor;
using Core.Inventory;
using Core.Game;
using Core.Location;
using Core.Spawning;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Core.Items.Editor
{
    public sealed class PickupableInteractableTests
    {
        private GameTestFixture _fixture;
        private MainCharacter _character;
        private PickupableInteractable _pickup;
        private ItemDefinition _item;

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Foraging boundaries");
            _fixture.AddSingleton<GameStateManager>();
            GameState.Time.initialized = true;
            GameState.Time.daysSinceStart = 1;
            GameState.Time.dayOfSeason = 1;
            GameState.Time.hour = 6;
            _fixture.AddSingleton<ItemManager>(manager =>
            {
                typeof(ItemManager).GetField("defaultPickupSound", BindingFlags.Instance | BindingFlags.NonPublic)
                    .SetValue(manager, AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/Core/Items/PickUpItem.wav"));
            });
            var level = _fixture.RegisterSingleton<LevelManager>();
            var location = _fixture.Own(ScriptableObject.CreateInstance<LocationData>());
            location.id = "test:pickup";
            typeof(LevelManager).GetProperty(nameof(LevelManager.CurrentLocationData)).SetValue(level, location);
            _character = _fixture.CreateCharacter();
            _item = AssetDatabase.LoadAssetAtPath<ItemDefinition>("Assets/Resources/Items/HarvestItem/RavenFlowerProduce.asset");
            var catalog = AssetDatabase.LoadAssetAtPath<SpawnableCatalog>("Assets/Content/SpawnableCatalog.asset");
            var spawner = _fixture.AddSingleton<WorldObjectSpawner>(owner => typeof(WorldObjectSpawner)
                .GetField("catalog", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(owner, catalog));
            spawner.gameObject.SetActive(true);
            spawner.EnterLocation(location, Array.Empty<AuthoredSpawnPlacement>());
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Content/Spawnables/ForageRavenFlower.prefab");
            _pickup = spawner.Spawn(prefab.GetComponent<SpawnedObject>(), Vector3.zero).GetComponent<PickupableInteractable>();
            GameTestFixture.Invoke(_pickup, "Awake");
            _fixture.Root.SetActive(true);
            // The fixture deliberately keeps its character inactive, outside the location lifecycle.
            _pickup.transform.position = _character.ToolInteractionAnchor.position + Vector3.down;
            _character.Orientation.ForceDirection(Vector2.down);
        }

        [TearDown] public void TearDown() => _fixture.Dispose();

        [Test]
        public void AuthoredForageAndPresentationPassPreGameplayValidation()
        {
            PickupConfigurationValidation.CheckPrefabs();
            Assert.That(_pickup.RequiresButtonPress, Is.True);
        }

        [Test]
        public void RequiresNearbyTargetInFrontOfTheCharacter()
        {
            Assert.That(_pickup.CanPickUp(_character), Is.True);
            _character.Orientation.ForceDirection(Vector2.up);
            Assert.That(_pickup.CanPickUp(_character), Is.False);
            _character.Orientation.ForceDirection(Vector2.down);
            _pickup.transform.position += Vector3.down * 10;
            Assert.That(_pickup.CanPickUp(_character), Is.False);
        }

        [Test]
        public void FullBagCanAcceptMatchingStackButMustFitTheWholeForageQuantity()
        {
            for (var i = 0; i < _character.MainInventory.Capacity; i++)
                _character.MainInventory.SetSlot(i, new ItemStack(_item, _item.MaxStackSize));
            Assert.That(_pickup.CanPickUp(_character), Is.False);
            _character.MainInventory.SetSlot(0, new ItemStack(_item, _item.MaxStackSize - 1));
            Assert.That(_pickup.CanPickUp(_character), Is.True);
            Set("quantity", 2);
            Assert.That(_pickup.CanPickUp(_character), Is.False);
            _character.MainInventory.SetSlot(1, ItemStack.Empty);
            Assert.That(_pickup.CanPickUp(_character), Is.True);
        }

        [Test]
        public void ExpiredForageCannotBePickedUp()
        {
            var state = (ForagePickupState)_pickup.GetComponent<ForagePickup>().State;
            GameState.Time.daysSinceStart = state.expiresOnDay;
            Assert.That(_pickup.CanPickUp(_character), Is.False);
        }

        [Test]
        public void GroundBlockerIsSeparateFromTheAnimatedVisual()
        {
            var solid = _pickup.transform.Find("Solid").GetComponent<Collider2D>();
            Assert.That(solid.isTrigger, Is.False);
            Assert.That(solid.gameObject.layer, Is.EqualTo(LayerMask.NameToLayer("Obstacles")));
            Assert.That(solid.transform.IsChildOf(_pickup.transform.Find("Visual")), Is.False);
        }

        private void Set(string field, object value) => typeof(PickupableInteractable)
            .GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(_pickup, value);
    }
}

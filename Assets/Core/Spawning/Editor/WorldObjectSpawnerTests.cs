using System;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using Character;
using Core.Common.Editor;
using Core.Inventory;
using Core.Location;
using Interaction;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;
using static Core.Common.Editor.Reflect;

namespace Core.Spawning.Editor
{
    public sealed class WorldObjectSpawnerTests : GameTest
    {
        private GameObject _systems;

        private GameObject _prefab;
        private WorldObjectSpawner _spawner;
        private SpawnedObject _prefabComponent;
        private GameObject _prefabHolder;
        private LocationData _location;

        [SetUp]
        public void SetUp()
        {

            _systems = Game.Root;

            _prefabHolder = new GameObject("Inactive prefab holder");
            _prefabHolder.SetActive(false);
            _prefab = new GameObject("Chest prefab");
            _prefab.transform.SetParent(_prefabHolder.transform);
            _prefabComponent = _prefab.AddComponent<SpawnedObject>();
            typeof(SpawnedObject).GetField("prefabId", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(_prefabComponent, "base:test-chest");
            _spawner = Game.CreateSpawner(_prefabComponent);
            _location = ScriptableObject.CreateInstance<LocationData>();
            _location.SetId("farm");
            _spawner.EnterLocation(_location, Array.Empty<AuthoredSpawnPlacement>());
        }

        [TearDown]
        public void TearDown()
        {
            _spawner.OnLocationLeave(_location);

            Object.DestroyImmediate(_prefab);
            Object.DestroyImmediate(_prefabHolder);
            Object.DestroyImmediate(_location);
        }

        [Test]
        public void AuthoredChestPrefabKeepsItsOwnerAndContentsAcrossLocationReentry()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Content/Spawnables/Chest.prefab")
                .GetComponent<PersistentContainer>();
            Assert.That(prefab, Is.Not.Null);
            _spawner.Register(prefab);
            var first = (PersistentContainer)_spawner.Spawn(prefab, new Vector3(4, 7, 0));
            var id = first.PersistentId;
            var item = AssetDatabase.LoadAssetAtPath<ItemDefinition>("Assets/Resources/Items/Tools/HoeToolData.asset");
            Assert.That(first.Storage.Inventory.AddItem(item, 1), Is.True);
            Assert.That(Game.State.World.TryGet(_location.Id, id, out ContainerState saved), Is.True);
            Assert.That(saved.OwnerCharacterId, Is.EqualTo("base:player"));
            _spawner.OnLocationLeave(_location);
            _spawner.EnterLocation(_location, Array.Empty<AuthoredSpawnPlacement>());
            var restored = _spawner.SpawnedObjects.OfType<PersistentContainer>().Single();
            Assert.That(restored.PersistentId, Is.EqualTo(id));
            Assert.That(restored.Storage.State, Is.SameAs(saved));
            Assert.That(restored.Storage.Inventory.GetSlot(0).Item, Is.SameAs(item));
            Assert.That(restored.Storage.Inventory.GetSlot(0).Quantity, Is.EqualTo(1));
        }

        [Test]
        public void SpawnRegistersStateAndLocationReentryKeepsIdentityAndChanges()
        {
            var first = _spawner.Spawn(_prefabComponent, new Vector3(4, 7, 0));
            var id = first.PersistentId;
            Assert.That(Guid.TryParseExact(id, "N", out _), Is.True);
            Assert.That(Game.State.World.TryGet(_location.Id, id, out SpawnedObjectState state), Is.True);
            Assert.That(state, Is.SameAs(first.State));
            state.interaction.uses = 2;
            first.transform.position = new Vector3(8, 9, 0);

            _spawner.OnLocationLeave(_location);
            Assert.That(state.position, Is.EqualTo(new Vector3(8, 9, 0)));
            _spawner.EnterLocation(_location, Array.Empty<AuthoredSpawnPlacement>());
            var restored = _spawner.SpawnedObjects
                .Single(instance => instance.PersistentId == id && instance.gameObject.activeSelf);
            Assert.That(restored.State, Is.SameAs(state));
            Assert.That(restored.State.interaction.uses, Is.EqualTo(2));
            Assert.That(restored.transform.position, Is.EqualTo(state.position));
            Assert.That(Game.State.World.GetStates<SpawnedObjectState>().Count(), Is.EqualTo(1));
        }

        [Test]
        public void AuthoredEntitiesUseStableIdsAndSavedStateOverridesPlacementDefaults()
        {
            _spawner.OnLocationLeave(_location);
            _prefab.transform.position = new Vector3(2, 3, 0);
            _prefab.transform.rotation = Quaternion.Euler(0, 0, 30);
            var placements = new[] { new AuthoredSpawnPlacement { id = "map-chest-1", template = _prefabComponent } };
            _spawner.EnterLocation(_location, placements);
            var view = _spawner.SpawnedObjects.Single();
            Assert.That(view.PersistentId, Is.EqualTo("map-chest-1"));
            Assert.That(view.State.authored, Is.True);
            Assert.That(view.transform.position, Is.EqualTo(_prefab.transform.position));
            view.State.interaction.uses = 4;
            view.transform.position = new Vector3(7, 8, 0);
            view.transform.rotation = Quaternion.Euler(0, 0, 75);
            _spawner.OnLocationLeave(_location);
            _prefab.transform.position = Vector3.zero; // An authored map update must not reset saved state.
            _spawner.EnterLocation(_location, placements);
            var restored = _spawner.SpawnedObjects.Single();
            Assert.That(restored.PersistentId, Is.EqualTo("map-chest-1"));
            Assert.That(restored.transform.position, Is.EqualTo(new Vector3(7, 8, 0)));
            Assert.That(Quaternion.Angle(restored.transform.rotation, Quaternion.Euler(0, 0, 75)), Is.LessThan(0.01f));
            Assert.That(restored.State.interaction.uses, Is.EqualTo(4));
            Assert.That(Game.State.World.GetStates<SpawnedObjectState>(_location.Id).Count(), Is.EqualTo(1));
        }

        [Test]
        public void RemovedAuthoredEntitiesLeaveMarkersAndDoNotReappear()
        {
            _spawner.OnLocationLeave(_location);
            var placements = new[] { new AuthoredSpawnPlacement { id = "chest", template = _prefabComponent } };
            _spawner.EnterLocation(_location, placements);
            _spawner.SpawnedObjects.Single().Remove();
            Assert.That(Game.State.World.TryGet(_location.Id, "chest", out SpawnedObjectState state), Is.True);
            Assert.That(state.removed, Is.True);
            _spawner.OnLocationLeave(_location);
            _spawner.EnterLocation(_location, placements);
            Assert.That(_spawner.SpawnedObjects, Is.Empty);
        }

        [Test]
        public void AuthoredEntitiesAbsentFromMapAreNotReconstructedButGeneratedEntitiesAre()
        {
            _spawner.OnLocationLeave(_location);
            _spawner.EnterLocation(_location,
                new[] { new AuthoredSpawnPlacement { id = "chest", template = _prefabComponent } });
            var generatedId = _spawner.Spawn(_prefabComponent, Vector3.one).PersistentId;
            _spawner.OnLocationLeave(_location);
            _spawner.EnterLocation(_location, Array.Empty<AuthoredSpawnPlacement>());
            Assert.That(_spawner.SpawnedObjects.Single().PersistentId, Is.EqualTo(generatedId));
            Assert.That(Game.State.World.TryGet(_location.Id, "chest", out SpawnedObjectState _), Is.True);
        }

        [Test]
        public void SpawnedInteractableWritesIntoItsEntityRecord()
        {
            _prefab.AddComponent<BoxCollider2D>().isTrigger = true;
            var template = Game.Add<TestInteractable>(_prefab);
            Set(template, "UnlimitedActivations", false);
            var spawned = _spawner.Spawn(_prefabComponent, Vector3.zero);
            var interaction = spawned.GetComponent<TestInteractable>();
            Assert.That(interaction.PersistentId, Is.EqualTo(spawned.PersistentId));
            Assert.That(interaction.CanInteract, Is.True);
            var boundState = spawned.State.interaction;
            var instigator = Game.Add<GameCharacter>(_systems);
            interaction.TriggerInteraction(instigator);
            Assert.That(spawned.State.interaction.uses, Is.EqualTo(1));
            Assert.That(interaction.CanInteract, Is.False);
            Assert.That(Game.State.World.TryGet(_location.Id, spawned.PersistentId, out SpawnedObjectState saved), Is.True);
            Assert.That(saved, Is.SameAs(spawned.State));
            Assert.That(saved.interaction, Is.SameAs(boundState));
        }

        [Test]
        public void MultipleInstancesHaveDistinctIdsAndDespawnRemovesTheRecord()
        {
            var first = _spawner.Spawn(_prefabComponent, Vector3.zero);
            var second = _spawner.Spawn(_prefabComponent, Vector3.one);
            Assert.That(first.PersistentId, Is.Not.EqualTo(second.PersistentId));
            var id = first.PersistentId;
            Assert.That(_spawner.Despawn(id), Is.True);
            Assert.That(Game.State.World.TryGet(_location.Id, id, out SpawnedObjectState _), Is.False);
            Assert.That(Game.State.World.GetStates<SpawnedObjectState>().Count(), Is.EqualTo(1));
        }

        [Test]
        public void SpawnBeforeLocationEntryThrows()
        {
            _spawner.OnLocationLeave(_location);
            Assert.Throws<InvalidOperationException>(() => _spawner.Spawn(_prefabComponent, Vector3.zero));
        }

        [Test]
        public void UnregisteredPrefabCannotCreateARecord()
        {
            var other = new GameObject("Unregistered prefab");
            other.transform.SetParent(_prefabHolder.transform);
            var prefab = other.AddComponent<SpawnedObject>();
            typeof(SpawnedObject).GetField("prefabId", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(prefab, "base:unregistered");
            Assert.Throws<InvalidOperationException>(() => _spawner.Spawn(prefab, Vector3.zero));
            Assert.That(Game.State.World.GetStates<SpawnedObjectState>().Count(), Is.Zero);
        }

        [Test]
        public void SameIdCannotReferToADifferentPrefab()
        {
            var other = new GameObject("Duplicate prefab");
            other.transform.SetParent(_prefabHolder.transform);
            var prefab = other.AddComponent<SpawnedObject>();
            typeof(SpawnedObject).GetField("prefabId", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(prefab, _prefabComponent.Id);
            Assert.DoesNotThrow(() => _spawner.Register(_prefabComponent));
            Assert.Throws<InvalidOperationException>(() => _spawner.Register(prefab));
            Assert.Throws<InvalidOperationException>(() => _spawner.Spawn(prefab, Vector3.zero));
        }

        [Test]
        public void MissingPrefabLogsAndSkipsOnlyItsOwnRecord()
        {
            var existing = _spawner.Spawn(_prefabComponent, Vector3.one);
            var id = existing.PersistentId;
            _spawner.OnLocationLeave(_location);
            Game.State.World.Set(_location.Id, "missing", new SpawnedObjectState { prefabId = "base:missing" });
            LogAssert.Expect(LogType.Exception, new Regex("No spawnable registered for 'base:missing'"));
            Assert.DoesNotThrow(() => _spawner.EnterLocation(_location, Array.Empty<AuthoredSpawnPlacement>()));
            Assert.That(_spawner.SpawnedObjects
                .Single().PersistentId, Is.EqualTo(id));
            Assert.That(Game.State.World.TryGet(_location.Id, "missing", out SpawnedObjectState _), Is.True);
        }

    }
}

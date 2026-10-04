using System;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using Core.Game;
using Core.Location;
using Interaction;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace Core.Spawning.Editor
{
    public sealed class WorldObjectSpawnerTests
    {
        private GameObject _systems;
        private GameObject _prefab;
        private WorldObjectSpawner _spawner;
        private SpawnedObject _prefabComponent;
        private GameObject _prefabHolder;
        private LocationData _location;
        private SpawnableCatalog _catalog;

        [SetUp]
        public void SetUp()
        {
            Assert.That(GameStateManager.Instance, Is.Null, "Run these isolated EditMode tests outside a game session.");
            Assert.That(WorldObjectSpawner.Instance, Is.Null);
            _systems = new GameObject("Spawner test systems");
            _systems.SetActive(false);
            var manager = _systems.AddComponent<GameStateManager>();
            _spawner = _systems.AddComponent<WorldObjectSpawner>();
            // EditMode does not run the normal scene initialization lifecycle.
            InvokeAwake(manager);
            _prefabHolder = new GameObject("Inactive prefab holder");
            _prefabHolder.SetActive(false);
            _prefab = new GameObject("Chest prefab");
            _prefab.transform.SetParent(_prefabHolder.transform);
            _prefabComponent = _prefab.AddComponent<SpawnedObject>();
            typeof(SpawnedObject).GetField("prefabId", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(_prefabComponent, "base:test-chest");
            _catalog = ScriptableObject.CreateInstance<SpawnableCatalog>();
            typeof(SpawnableCatalog).GetField("prefabs", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(_catalog, new[] { _prefabComponent });
            typeof(WorldObjectSpawner).GetField("catalog", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(_spawner, _catalog);
            InvokeAwake(_spawner);
            _location = ScriptableObject.CreateInstance<LocationData>();
            _location.id = "farm";
            _spawner.OnLocationEnter(_location);
        }

        [TearDown]
        public void TearDown()
        {
            if (_spawner) _spawner.OnLocationLeave(_location);
            // Match the manual Awake above for objects that never became active in EditMode.
            if (_spawner) InvokeDestroy(_spawner);
            if (_systems) InvokeDestroy(_systems.GetComponent<GameStateManager>());
            Object.DestroyImmediate(_systems);
            Object.DestroyImmediate(_prefab);
            Object.DestroyImmediate(_prefabHolder);
            Object.DestroyImmediate(_location);
            Object.DestroyImmediate(_catalog);
        }

        [Test]
        public void SpawnRegistersStateAndLocationReentryKeepsIdentityAndChanges()
        {
            var first = _spawner.Spawn(_prefabComponent, new Vector3(4, 7, 0));
            var id = first.PersistentId;
            Assert.That(Guid.TryParseExact(id, "N", out _), Is.True);
            Assert.That(GameState.World.TryGet(_location.id, id, out SpawnedObjectState state), Is.True);
            Assert.That(state, Is.SameAs(first.State));
            state.interaction.uses = 2;
            first.transform.position = new Vector3(8, 9, 0);

            _spawner.OnLocationLeave(_location);
            Assert.That(state.position, Is.EqualTo(new Vector3(8, 9, 0)));
            _spawner.OnLocationEnter(_location);
            var restored = _systems.GetComponentsInChildren<SpawnedObject>(true)
                .Single(instance => instance.PersistentId == id && instance.gameObject.activeSelf);
            Assert.That(restored.State, Is.SameAs(state));
            Assert.That(restored.State.interaction.uses, Is.EqualTo(2));
            Assert.That(restored.transform.position, Is.EqualTo(state.position));
            Assert.That(GameState.World.GetStates<SpawnedObjectState>().Count(), Is.EqualTo(1));
        }

        [Test]
        public void AuthoredEntitiesUseStableIdsAndSavedStateOverridesPlacementDefaults()
        {
            _spawner.OnLocationLeave(_location);
            _prefab.transform.position = new Vector3(2, 3, 0);
            _prefab.transform.rotation = Quaternion.Euler(0, 0, 30);
            var placements = new[] { new AuthoredSpawnPlacement { id = "map-chest-1", template = _prefabComponent } };
            _spawner.EnterLocation(_location, placements);
            var view = _systems.GetComponentsInChildren<SpawnedObject>(true).Single();
            Assert.That(view.PersistentId, Is.EqualTo("map-chest-1"));
            Assert.That(view.State.authored, Is.True);
            Assert.That(view.transform.position, Is.EqualTo(_prefab.transform.position));
            view.State.interaction.uses = 4;
            view.transform.position = new Vector3(7, 8, 0);
            view.transform.rotation = Quaternion.Euler(0, 0, 75);
            _spawner.OnLocationLeave(_location);
            _prefab.transform.position = Vector3.zero; // An authored map update must not reset saved state.
            _spawner.EnterLocation(_location, placements);
            var restored = _systems.GetComponentsInChildren<SpawnedObject>(true).Single();
            Assert.That(restored.PersistentId, Is.EqualTo("map-chest-1"));
            Assert.That(restored.transform.position, Is.EqualTo(new Vector3(7, 8, 0)));
            Assert.That(Quaternion.Angle(restored.transform.rotation, Quaternion.Euler(0, 0, 75)), Is.LessThan(0.01f));
            Assert.That(restored.State.interaction.uses, Is.EqualTo(4));
            Assert.That(GameState.World.GetStates<SpawnedObjectState>(_location.id).Count(), Is.EqualTo(1));
        }

        [Test]
        public void RemovedAuthoredEntitiesLeaveMarkersAndDoNotReappear()
        {
            _spawner.OnLocationLeave(_location);
            var placements = new[] { new AuthoredSpawnPlacement { id = "chest", template = _prefabComponent } };
            _spawner.EnterLocation(_location, placements);
            _systems.GetComponentsInChildren<SpawnedObject>(true).Single().Remove();
            Assert.That(GameState.World.TryGet(_location.id, "chest", out SpawnedObjectState state), Is.True);
            Assert.That(state.removed, Is.True);
            _spawner.OnLocationLeave(_location);
            _spawner.EnterLocation(_location, placements);
            Assert.That(_systems.GetComponentsInChildren<SpawnedObject>(true), Is.Empty);
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
            Assert.That(_systems.GetComponentsInChildren<SpawnedObject>(true).Single().PersistentId, Is.EqualTo(generatedId));
            Assert.That(GameState.World.TryGet(_location.id, "chest", out SpawnedObjectState _), Is.True);
        }

        [Test]
        public void SpawnedInteractableWritesIntoItsEntityRecord()
        {
            var template = _prefab.AddComponent<TestInteractable>();
            typeof(AbstractInteractable).GetField("UnlimitedActivations", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(template, false);
            var spawned = _spawner.Spawn(_prefabComponent, Vector3.zero);
            var interaction = spawned.GetComponent<TestInteractable>();
            Assert.That(interaction.PersistentId, Is.EqualTo(spawned.PersistentId));
            Assert.That(interaction.CanInteract, Is.True);
            var boundState = spawned.State.interaction;
            var instigator = _systems.AddComponent<Character.GameCharacter>();
            interaction.TriggerInteraction(instigator);
            Assert.That(spawned.State.interaction.uses, Is.EqualTo(1));
            Assert.That(interaction.CanInteract, Is.False);
            Assert.That(GameState.World.TryGet(_location.id, spawned.PersistentId, out SpawnedObjectState saved), Is.True);
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
            Assert.That(GameState.World.TryGet(_location.id, id, out SpawnedObjectState _), Is.False);
            Assert.That(GameState.World.GetStates<SpawnedObjectState>().Count(), Is.EqualTo(1));
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
            Assert.That(GameState.World.GetStates<SpawnedObjectState>().Count(), Is.Zero);
        }

        [Test]
        public void SameIdCannotReferToADifferentPrefab()
        {
            var other = new GameObject("Duplicate prefab");
            other.transform.SetParent(_prefabHolder.transform);
            var prefab = other.AddComponent<SpawnedObject>();
            typeof(SpawnedObject).GetField("prefabId", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(prefab, _prefabComponent.PrefabId);
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
            GameState.World.Set(_location.id, "missing", new SpawnedObjectState { prefabId = "base:missing" });
            LogAssert.Expect(LogType.Exception, new Regex("No spawnable registered for 'base:missing'"));
            Assert.DoesNotThrow(() => _spawner.OnLocationEnter(_location));
            Assert.That(_systems.GetComponentsInChildren<SpawnedObject>(true)
                .Single().PersistentId, Is.EqualTo(id));
            Assert.That(GameState.World.TryGet(_location.id, "missing", out SpawnedObjectState _), Is.True);
        }

        private static void InvokeAwake(Component component) => component.GetType()
            .GetMethod("Awake", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(component, null);

        private static void InvokeDestroy(Component component) => component.GetType()
            .GetMethod("OnDestroy", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(component, null);
    }
}

using Core.Catalogs;
using System;
using System.Collections.Generic;
using System.Linq;
using Core.Game;
using Core.Location;
using Core.Tile;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using Object = UnityEngine.Object;

namespace Core.Spawning
{
    /// <summary>Creates saved entities and materializes their views for the current location.</summary>
    public sealed class WorldObjectSpawner : ILocationLifecycle, IDisposable
    {
        private readonly IObjectResolver _resolver;
        private readonly GameState _gameState;
        private readonly MapManager _mapManager;
        private readonly GameObject _root;
        private readonly Dictionary<string, SpawnedObject> _prefabs = new(StringComparer.Ordinal);
        private readonly Dictionary<string, SpawnedObject> _instances = new(StringComparer.Ordinal);
        private readonly Dictionary<string, AuthoredSpawnPlacement> _placements = new(StringComparer.Ordinal);
        private Transform _stagingRoot;
        private Transform _locationRoot;
        private string _locationId;

        /// <summary>Objects currently spawned in this location, including those restored from a save.</summary>
        public IReadOnlyCollection<SpawnedObject> SpawnedObjects => _instances.Values;
        public IReadOnlyCollection<SpawnedObject> RegisteredPrefabs => _prefabs.Values;

        public WorldObjectSpawner(IObjectResolver resolver, GameState gameState, MapManager mapManager, DefinitionCatalog catalog)
        {
            _resolver = resolver;
            _gameState = gameState;
            _mapManager = mapManager;
            // Spawned views live under one root that outlasts location scenes, like the session itself.
            _root = new GameObject("World objects");
            if (Application.isPlaying) Object.DontDestroyOnLoad(_root);
            var staging = new GameObject("Spawn staging");
            staging.SetActive(false);
            staging.transform.SetParent(_root.transform, false);
            _stagingRoot = staging.transform;
            foreach (var prefab in catalog.All<SpawnedObject>()) Register(prefab);
        }

        public void Dispose()
        {
            ClearViews();
            DestroyView(_root);
        }

        /// <summary>Register additional content, for example from a mod, before spawning or restoring it.</summary>
        public void Register(SpawnedObject prefab)
        {
            if (_prefabs.TryGetValue(prefab.Id, out var existing) && existing != prefab)
                throw new InvalidOperationException($"Duplicate spawnable ID '{prefab.Id}'.");
            _prefabs[prefab.Id] = prefab;
        }

        /// <summary>Spawn a registered prefab at an absolute world position; saving is automatic.</summary>
        public SpawnedObject Spawn(SpawnedObject prefab, Vector3 position,
            SpawnedObjectState state = null)
        {
            if (_locationId == null)
                throw new InvalidOperationException("Enter a location before spawning an object.");
            if (Resolve(prefab.Id) != prefab)
                throw new InvalidOperationException($"'{prefab.name}' is not registered.");
            state ??= prefab.CreateState(_gameState.Time.daysSinceStart);
            state.prefabId = prefab.Id;
            state.position = position;
            state.rotation = prefab.transform.rotation;
            state.authored = false;
            state.removed = false;
            var id = Guid.NewGuid().ToString("N");
            _gameState.World.Set(_locationId, id, state);
            return Materialize(id, state);
        }

        public bool Despawn(string id)
        {
            if (_instances.Remove(id, out var instance)) DestroyView(instance.gameObject);
            if (_gameState.World.TryGet(_locationId, id, out SpawnedObjectState state) && state.authored)
            {
                state.removed = true;
                return true;
            }
            return _gameState.World.Remove(_locationId, id);
        }

        public void OnLocationEnter(LocationData location) =>
            EnterLocation(location, _mapManager.CurrentMap.PersistentEntities);

        /// <summary>Restores the location and seeds missing authored records from their configured templates.</summary>
        public void EnterLocation(LocationData location, IReadOnlyList<AuthoredSpawnPlacement> placements)
        {
            if (_locationId == location.Id) return;
            ClearViews();
            _locationId = location.Id;
            _locationRoot = new GameObject("Spawned objects").transform;
            _locationRoot.SetParent(_root.transform, false);
            foreach (var placement in placements)
            {
                try
                {
                    _placements.Add(placement.id, placement);
                    if (_gameState.World.TryGet(_locationId, placement.id, out SpawnedObjectState _)) continue;
                    var state = placement.template.CreateState(_gameState.Time.daysSinceStart);
                    state.prefabId = placement.template.Id;
                    state.position = placement.template.transform.position;
                    state.rotation = placement.template.transform.rotation;
                    state.authored = true;
                    _gameState.World.Set(_locationId, placement.id, state);
                }
                catch (Exception exception) { Debug.LogException(exception); }
            }
            foreach (var pair in _gameState.World.GetStates<SpawnedObjectState>(_locationId).ToArray())
            {
                // An earlier spot's OnEnable can expire a pickup included in this restoration snapshot.
                if (!_gameState.World.TryGet(_locationId, pair.Key, out SpawnedObjectState _)) continue;
                if (pair.Value.removed || pair.Value.authored && !_placements.ContainsKey(pair.Key)) continue;
                try { Materialize(pair.Key, pair.Value); }
                catch (Exception exception) { Debug.LogException(exception); }
            }
        }

        public void OnLocationLeave(LocationData location) => ClearViews();

        /// <summary>Call before saving to capture movement performed directly on transforms.</summary>
        public void SavePositions()
        {
            foreach (var instance in _instances.Values)
                if (instance) instance.SavePosition();
        }

        private SpawnedObject Materialize(string id, SpawnedObjectState state)
        {
            var prefab = Resolve(state.prefabId);
            var template = state.authored ? _placements[id].template : prefab;
            var instance = _resolver.Instantiate(template, state.position, state.rotation, _stagingRoot);
            instance.Bind(this, id, state);
            _instances.Add(id, instance); // OnEnable may remove itself during reparenting.
            instance.transform.SetParent(_locationRoot, true);
            return instance;
        }

        private SpawnedObject Resolve(string prefabId) =>
            _prefabs.TryGetValue(prefabId, out var prefab)
                ? prefab
                : throw new InvalidOperationException($"No spawnable registered for '{prefabId}'.");

        private void ClearViews()
        {
            SavePositions();
            if (_locationRoot)
            {
                _locationRoot.gameObject.SetActive(false);
                DestroyView(_locationRoot.gameObject);
            }
            _instances.Clear();
            _placements.Clear();
            _locationRoot = null;
            _locationId = null;
        }

        private static void DestroyView(GameObject view)
        {
            if (Application.isPlaying) Object.Destroy(view);
            else Object.DestroyImmediate(view);
        }
    }
}

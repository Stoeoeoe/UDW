using System;
using System.Collections.Generic;
using System.Linq;
using Core.Game;
using Core.Location;
using Core.Tile;
using UnityEngine;

namespace Core.Spawning
{
    /// <summary>Creates saved entities and materializes their views for the current location.</summary>
    [DefaultExecutionOrder(-900)]
    public sealed class WorldObjectSpawner : Singleton<WorldObjectSpawner>, ILocationLifecycle
    {
        [SerializeField] private SpawnableCatalog catalog;
        private readonly Dictionary<string, SpawnedObject> _prefabs = new(StringComparer.Ordinal);
        private readonly Dictionary<string, SpawnedObject> _instances = new(StringComparer.Ordinal);
        private readonly Dictionary<string, AuthoredSpawnPlacement> _placements = new(StringComparer.Ordinal);
        private Transform _stagingRoot;
        private Transform _locationRoot;
        private string _locationId;
        private LevelManager _levelManager;

        protected override void OnAwake()
        {
            if (!catalog) throw new InvalidOperationException("WorldObjectSpawner requires a SpawnableCatalog.");
            var staging = new GameObject("Spawn staging");
            staging.SetActive(false);
            staging.transform.SetParent(transform, false);
            _stagingRoot = staging.transform;
            foreach (var prefab in catalog.Prefabs) Register(prefab);
        }

        private void Start()
        {
            // Auto-created SystemRoot children can enable before LevelManager.Awake.
            _levelManager = LevelManager.Instance
                ?? throw new InvalidOperationException("WorldObjectSpawner requires LevelManager before startup.");
            _levelManager.RegisterLifecycle(this);
        }

        private void OnEnable()
        {
            if (_levelManager) _levelManager.RegisterLifecycle(this);
        }

        private void OnDisable()
        {
            if (_levelManager) _levelManager.UnregisterLifecycle(this);
            ClearViews();
        }

        /// <summary>Register additional content, for example from a mod, before spawning or restoring it.</summary>
        public void Register(SpawnedObject prefab)
        {
            if (_prefabs.TryGetValue(prefab.PrefabId, out var existing) && existing != prefab)
                throw new InvalidOperationException($"Duplicate spawnable ID '{prefab.PrefabId}'.");
            _prefabs[prefab.PrefabId] = prefab;
        }

        /// <summary>Spawn a registered prefab at an absolute world position; saving is automatic.</summary>
        public SpawnedObject Spawn(SpawnedObject prefab, Vector3 position,
            SpawnedObjectState state = null)
        {
            if (_locationId == null)
                throw new InvalidOperationException("Enter a location before spawning an object.");
            if (Resolve(prefab.PrefabId) != prefab)
                throw new InvalidOperationException($"'{prefab.name}' is not registered.");
            state ??= prefab.CreateState();
            state.prefabId = prefab.PrefabId;
            state.position = position;
            state.rotation = prefab.transform.rotation;
            state.authored = false;
            state.removed = false;
            var id = Guid.NewGuid().ToString("N");
            GameState.World.Set(_locationId, id, state);
            return Materialize(id, state);
        }

        public bool Despawn(string id)
        {
            if (_instances.Remove(id, out var instance)) DestroyView(instance.gameObject);
            if (GameState.World.TryGet(_locationId, id, out SpawnedObjectState state) && state.authored)
            {
                state.removed = true;
                return true;
            }
            return GameState.World.Remove(_locationId, id);
        }

        public void OnLocationEnter(LocationData location) =>
            EnterLocation(location, MapManager.Instance?.CurrentMap?.PersistentEntities ?? Array.Empty<AuthoredSpawnPlacement>());

        /// <summary>Restores the location and seeds missing authored records from their configured templates.</summary>
        public void EnterLocation(LocationData location, IReadOnlyList<AuthoredSpawnPlacement> placements)
        {
            if (_locationId == location.id) return;
            ClearViews();
            _locationId = location.id;
            _locationRoot = new GameObject("Spawned objects").transform;
            _locationRoot.SetParent(transform, false);
            foreach (var placement in placements)
            {
                try
                {
                    _placements.Add(placement.id, placement);
                    if (GameState.World.TryGet(_locationId, placement.id, out SpawnedObjectState _)) continue;
                    var state = placement.template.CreateState();
                    state.prefabId = placement.template.PrefabId;
                    state.position = placement.template.transform.position;
                    state.rotation = placement.template.transform.rotation;
                    state.authored = true;
                    GameState.World.Set(_locationId, placement.id, state);
                }
                catch (Exception exception) { Debug.LogException(exception, this); }
            }
            foreach (var pair in GameState.World.GetStates<SpawnedObjectState>(_locationId).ToArray())
            {
                if (pair.Value.removed || pair.Value.authored && !_placements.ContainsKey(pair.Key)) continue;
                try { Materialize(pair.Key, pair.Value); }
                catch (Exception exception) { Debug.LogException(exception, this); }
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
            var instance = Instantiate(template, state.position, state.rotation, _stagingRoot);
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
            if (Application.isPlaying) Destroy(view);
            else DestroyImmediate(view);
        }
    }
}

using System;
using System.Collections.Generic;
using Core.Location;
using UnityEngine;

namespace Core.Tile.Vulcanus
{
    [CreateAssetMenu(fileName = "VulcanusWorldCatalog", menuName = "Game/Vulcanus/World Catalog")]
    public class VulcanusWorldCatalog : ScriptableObject
    {
        [Serializable]
        public class MapBinding
        {
            public string mapId;
            public GameObject mapPrefab;
            public LocationData locationData;
        }

        [Header("Source")]
        [SerializeField] private VulcanusProject project;

        [Header("Mappings")]
        [SerializeField] private VulcanusProject.EntityPrefabMapping[] entityPrefabMappings = Array.Empty<VulcanusProject.EntityPrefabMapping>();
        [SerializeField] private VulcanusProject.MapLocationMapping[] locationMappings = Array.Empty<VulcanusProject.MapLocationMapping>();

        [Header("Map Prefabs")]
        [SerializeField] private MapBinding[] mapBindings = Array.Empty<MapBinding>();

        private Dictionary<string, MapBinding> _bindingByMapId;
        private Dictionary<string, MapBinding> _bindingByLocationId;

        public VulcanusProject Project => project;
        public VulcanusProject.EntityPrefabMapping[] EntityPrefabMappings => entityPrefabMappings;
        public VulcanusProject.MapLocationMapping[] LocationMappings => locationMappings;
        public MapBinding[] MapBindings => mapBindings;

        public void ApplySyncData(
            VulcanusProject.EntityPrefabMapping[] entityMappings,
            VulcanusProject.MapLocationMapping[] locations,
            MapBinding[] bindings)
        {
            entityPrefabMappings = entityMappings ?? Array.Empty<VulcanusProject.EntityPrefabMapping>();
            locationMappings = locations ?? Array.Empty<VulcanusProject.MapLocationMapping>();
            mapBindings = bindings ?? Array.Empty<MapBinding>();
            RebuildCaches();
        }

        public bool TryGetEntityPrefab(string entityTypeId, out GameObject prefab)
        {
            prefab = null;
            if (string.IsNullOrWhiteSpace(entityTypeId) || entityPrefabMappings == null)
                return false;

            for (var i = 0; i < entityPrefabMappings.Length; i++)
            {
                var mapping = entityPrefabMappings[i];
                if (mapping == null || !string.Equals(mapping.entityTypeId, entityTypeId, StringComparison.OrdinalIgnoreCase))
                    continue;

                prefab = mapping.prefab;
                return prefab != null;
            }

            return false;
        }


        public bool TryGetLocationDataByMapId(string mapId, out LocationData locationData)
        {
            locationData = null;
            if (string.IsNullOrWhiteSpace(mapId))
                return false;

            EnsureCaches();
            if (_bindingByMapId != null && _bindingByMapId.TryGetValue(mapId, out var binding) && binding.locationData != null)
            {
                locationData = binding.locationData;
                return true;
            }

            if (locationMappings == null)
                return false;

            for (var i = 0; i < locationMappings.Length; i++)
            {
                var mapping = locationMappings[i];
                if (mapping == null || !string.Equals(mapping.mapId, mapId, StringComparison.OrdinalIgnoreCase))
                    continue;

                locationData = mapping.locationData;
                return locationData != null;
            }

            return false;
        }

        public bool TryGetMapPrefabByMapId(string mapId, out GameObject mapPrefab)
        {
            mapPrefab = null;
            if (string.IsNullOrWhiteSpace(mapId))
                return false;

            EnsureCaches();
            if (_bindingByMapId != null && _bindingByMapId.TryGetValue(mapId, out var binding))
            {
                mapPrefab = binding.mapPrefab;
                return mapPrefab != null;
            }

            return false;
        }

        public bool TryGetMapPrefabForLocation(LocationData location, out GameObject mapPrefab)
        {
            mapPrefab = null;
            if (location == null)
                return false;

            EnsureCaches();

            if (!string.IsNullOrWhiteSpace(location.id) && _bindingByLocationId != null && _bindingByLocationId.TryGetValue(location.id, out var byIdBinding))
            {
                mapPrefab = byIdBinding.mapPrefab;
                if (mapPrefab != null)
                    return true;
            }

            if (mapBindings != null)
            {
                for (var i = 0; i < mapBindings.Length; i++)
                {
                    var binding = mapBindings[i];
                    if (binding == null || !ReferenceEquals(binding.locationData, location))
                        continue;

                    mapPrefab = binding.mapPrefab;
                    return mapPrefab != null;
                }
            }

            return TryGetMapPrefabByMapId(location.id, out mapPrefab);
        }

        public LocationData[] GetMappedLocations()
        {
            var set = new HashSet<LocationData>();

            if (locationMappings != null)
            {
                for (var i = 0; i < locationMappings.Length; i++)
                {
                    var location = locationMappings[i]?.locationData;
                    if (location != null)
                        set.Add(location);
                }
            }

            if (mapBindings != null)
            {
                for (var i = 0; i < mapBindings.Length; i++)
                {
                    var location = mapBindings[i]?.locationData;
                    if (location != null)
                        set.Add(location);
                }
            }

            var result = new LocationData[set.Count];
            set.CopyTo(result);
            return result;
        }

        private void OnEnable()
        {
            RebuildCaches();
        }

        private void OnValidate()
        {
            RebuildCaches();
        }

        private void EnsureCaches()
        {
            if (_bindingByMapId == null || _bindingByLocationId == null)
                RebuildCaches();
        }

        private void RebuildCaches()
        {
            _bindingByMapId = new Dictionary<string, MapBinding>(StringComparer.OrdinalIgnoreCase);
            _bindingByLocationId = new Dictionary<string, MapBinding>(StringComparer.OrdinalIgnoreCase);

            if (mapBindings == null)
                return;

            for (var i = 0; i < mapBindings.Length; i++)
            {
                var binding = mapBindings[i];
                if (binding == null || string.IsNullOrWhiteSpace(binding.mapId))
                    continue;

                if (!_bindingByMapId.ContainsKey(binding.mapId))
                    _bindingByMapId.Add(binding.mapId, binding);

                var locationId = binding.locationData != null ? binding.locationData.id : null;
                if (string.IsNullOrWhiteSpace(locationId))
                    continue;

                if (!_bindingByLocationId.ContainsKey(locationId))
                    _bindingByLocationId.Add(locationId, binding);
            }
        }
    }
}

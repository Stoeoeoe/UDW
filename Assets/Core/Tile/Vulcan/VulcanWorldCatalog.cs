using System;
using System.Collections.Generic;
using Core.Catalogs;
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
            [SerializeField] private string mapId;
            [SerializeField] private GameObject mapPrefab;
            [SerializeField] private LocationData locationData;
            [SerializeField, HideInInspector] private string sourceAssetGuid;

            public string MapId => mapId;
            public GameObject MapPrefab => mapPrefab;
            public LocationData LocationData => locationData;
            public string SourceAssetGuid => sourceAssetGuid;

            public MapBinding() { }
            public MapBinding(string mapId, GameObject mapPrefab, LocationData locationData, string sourceAssetGuid = null)
            {
                this.mapId = mapId;
                this.mapPrefab = mapPrefab;
                this.locationData = locationData;
                this.sourceAssetGuid = sourceAssetGuid;
            }
        }

        [Header("Source")]
        [SerializeField] private VulcanusProject project;

        [Header("Mappings")]
        [SerializeField] private VulcanusProject.EntityPrefabMapping[] entityPrefabMappings = Array.Empty<VulcanusProject.EntityPrefabMapping>();

        [Header("Map Prefabs")]
        [SerializeField] private MapBinding[] mapBindings = Array.Empty<MapBinding>();

        [NonSerialized] private Dictionary<string, MapBinding> _bindingByMapId;
        [NonSerialized] private Dictionary<string, MapBinding> _bindingByLocationId;

        public VulcanusProject Project => project;
        public VulcanusProject.EntityPrefabMapping[] EntityPrefabMappings => CloneOrEmpty(entityPrefabMappings);
        public MapBinding[] MapBindings => CloneOrEmpty(mapBindings);

        private static T[] CloneOrEmpty<T>(T[] source) => source == null ? Array.Empty<T>() : (T[])source.Clone();

        public void ApplySyncData(
            VulcanusProject.EntityPrefabMapping[] entityMappings,
            MapBinding[] bindings)
        {
            entityPrefabMappings = CloneOrEmpty(entityMappings);
            mapBindings = CloneOrEmpty(bindings);
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
                if (mapping == null || !string.Equals(mapping.GetEntityTypeId(), entityTypeId, StringComparison.OrdinalIgnoreCase))
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
            if (_bindingByMapId != null && _bindingByMapId.TryGetValue(mapId, out var binding) && binding.LocationData != null)
            {
                locationData = binding.LocationData;
                return true;
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
                mapPrefab = binding.MapPrefab;
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
                mapPrefab = byIdBinding.MapPrefab;
                if (mapPrefab != null)
                    return true;
            }

            if (mapBindings != null)
            {
                for (var i = 0; i < mapBindings.Length; i++)
                {
                    var binding = mapBindings[i];
                    if (binding == null || !ReferenceEquals(binding.LocationData, location))
                        continue;

                    mapPrefab = binding.MapPrefab;
                    return mapPrefab != null;
                }
            }

            return TryGetMapPrefabByMapId(location.id, out mapPrefab);
        }

        public LocationData[] GetMappedLocations()
        {
            var set = new HashSet<LocationData>();

            if (mapBindings != null)
            {
                for (var i = 0; i < mapBindings.Length; i++)
                {
                    var location = mapBindings[i]?.LocationData;
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
            _bindingByMapId = IdIndex.FirstWins(mapBindings, binding => binding?.MapId,
                StringComparer.OrdinalIgnoreCase);
            _bindingByLocationId = IdIndex.FirstWins(mapBindings, binding =>
                binding != null && !string.IsNullOrWhiteSpace(binding.MapId) && binding.LocationData
                    ? binding.LocationData.id : null, StringComparer.OrdinalIgnoreCase);
        }
    }
}

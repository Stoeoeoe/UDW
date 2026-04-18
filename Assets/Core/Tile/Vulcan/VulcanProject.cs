using System;
using System.Collections.Generic;
using Core.Location;
using UnityEngine;

namespace Core.Tile.Vulcanus
{
    [CreateAssetMenu(fileName = "VulcanusProject", menuName = "Game/Vulcanus/Project")]
    public class VulcanusProject : ScriptableObject
    {
        [System.Serializable]
        public struct TerrainDefinition
        {
            public string id;
            public string displayName;
            public Color color;
            public TerrainType mappedTerrainType;
        }

        [System.Serializable]
        public struct LayerDefinition
        {
            public string id;
            public string name;
            public string type;
            public Color color;
            public int zIndex;
        }

        [Serializable]
        public struct EntityTypeDefinition
        {
            public string id;
            public string displayName;
            public string category;
            public string group;
        }

        [Serializable]
        public struct PropertyDefinition
        {
            public string key;
            public string label;
            public string type;
            public string defaultValue;
            public bool required;
        }

        [Serializable]
        public class EntityPrefabMapping
        {
            public string entityTypeId;
            public string entityDisplayName;
            public GameObject prefab;
            public string[] candidatePrefabPaths = Array.Empty<string>();
        }

        [Serializable]
        public class MapLocationMapping
        {
            public string mapId;
            public LocationData locationData;
        }

        [SerializeField] private string version;
        [SerializeField] private string projectName;
        [SerializeField] private int tileSize;
        [SerializeField] private int defaultMapWidth;
        [SerializeField] private int defaultMapHeight;
        [SerializeField] private TerrainDefinition[] terrainTypes = Array.Empty<TerrainDefinition>();
        [SerializeField] private LayerDefinition[] layerDefinitions = Array.Empty<LayerDefinition>();
        [SerializeField] private EntityTypeDefinition[] entityTypes = Array.Empty<EntityTypeDefinition>();
        [SerializeField] private PropertyDefinition[] tileMetadataDefinitions = Array.Empty<PropertyDefinition>();

        [Header("Mappings")]
        [SerializeField] private GameObject locationLinkPrefab;
        [SerializeField] private EntityPrefabMapping[] entityPrefabMappings = Array.Empty<EntityPrefabMapping>();
        [SerializeField] private ItemClassMapping[] itemClassMappings = Array.Empty<ItemClassMapping>();
        [SerializeField] private MapLocationMapping[] locationMappings = Array.Empty<MapLocationMapping>();

        [Header("Importer Diagnostics")]
        [SerializeField] private string[] mappingWarnings = Array.Empty<string>();

        public string Version => version;
        public string ProjectName => projectName;
        public int TileSize => tileSize;
        public int DefaultMapWidth => defaultMapWidth;
        public int DefaultMapHeight => defaultMapHeight;
        public TerrainDefinition[] TerrainTypes => terrainTypes;
        public LayerDefinition[] LayerDefinitions => layerDefinitions;
        public EntityTypeDefinition[] EntityTypes => entityTypes;
        public PropertyDefinition[] TileMetadataDefinitions => tileMetadataDefinitions;
        public GameObject LocationLinkPrefab => locationLinkPrefab;
        public EntityPrefabMapping[] EntityPrefabMappings => entityPrefabMappings;
        public ItemClassMapping[] ItemClassMappings => itemClassMappings;
        public MapLocationMapping[] LocationMappings => locationMappings;
        public string[] MappingWarnings => mappingWarnings;

        public void Configure(
            string fileVersion,
            string name,
            int size,
            int mapWidth,
            int mapHeight,
            TerrainDefinition[] terrains,
            LayerDefinition[] layers,
            EntityTypeDefinition[] entities,
            PropertyDefinition[] metadataDefinitions = null)
        {
            version = fileVersion;
            projectName = name;
            tileSize = size;
            defaultMapWidth = mapWidth;
            defaultMapHeight = mapHeight;
            terrainTypes = terrains ?? Array.Empty<TerrainDefinition>();
            layerDefinitions = layers ?? Array.Empty<LayerDefinition>();
            entityTypes = entities ?? Array.Empty<EntityTypeDefinition>();
            tileMetadataDefinitions = metadataDefinitions ?? Array.Empty<PropertyDefinition>();
        }

        public void SetMappings(
            GameObject linkPrefab,
            EntityPrefabMapping[] entityMappings,
            MapLocationMapping[] mapLocations,
            ItemClassMapping[] itemMappings,
            string[] warnings)
        {
            locationLinkPrefab = linkPrefab;
            entityPrefabMappings = entityMappings ?? Array.Empty<EntityPrefabMapping>();
            itemClassMappings = itemMappings ?? Array.Empty<ItemClassMapping>();
            locationMappings = mapLocations ?? Array.Empty<MapLocationMapping>();
            mappingWarnings = warnings ?? Array.Empty<string>();
        }

        [Serializable]
        public class ItemClassMapping
        {
            public string classId;
            public string className;
            public string[] candidateTypeNames = Array.Empty<string>();
        }

        public bool TryMapTerrainId(string terrainId, out TerrainType terrainType)
        {
            terrainType = TerrainType.Invalid;
            if (string.IsNullOrWhiteSpace(terrainId) || terrainTypes == null)
                return false;

            for (int i = 0; i < terrainTypes.Length; i++)
            {
                var terrain = terrainTypes[i];
                if (string.Equals(terrain.id, terrainId, System.StringComparison.OrdinalIgnoreCase))
                {
                    terrainType = terrain.mappedTerrainType;
                    return true;
                }
            }

            return false;
        }

        public bool TryGetEntityPrefab(string entityTypeId, out GameObject prefab)
        {
            prefab = null;
            if (string.IsNullOrWhiteSpace(entityTypeId) || entityPrefabMappings == null)
                return false;

            for (int i = 0; i < entityPrefabMappings.Length; i++)
            {
                var mapping = entityPrefabMappings[i];
                if (mapping == null)
                    continue;

                if (!string.Equals(mapping.entityTypeId, entityTypeId, StringComparison.OrdinalIgnoreCase))
                    continue;

                prefab = mapping.prefab;
                return prefab != null;
            }

            return false;
        }

        public bool TryGetLocationData(string mapId, out LocationData locationData)
        {
            locationData = null;
            if (string.IsNullOrWhiteSpace(mapId) || locationMappings == null)
                return false;

            for (int i = 0; i < locationMappings.Length; i++)
            {
                var mapping = locationMappings[i];
                if (mapping == null)
                    continue;

                if (!string.Equals(mapping.mapId, mapId, StringComparison.OrdinalIgnoreCase))
                    continue;

                locationData = mapping.locationData;
                return locationData != null;
            }

            return false;
        }

        public bool TryGetLocationLinkPrefab(out GameObject prefab)
        {
            prefab = locationLinkPrefab;
            return prefab != null;
        }
    }
}

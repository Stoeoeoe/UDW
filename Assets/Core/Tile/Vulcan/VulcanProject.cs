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
            [HideInInspector] public string entityTypeId;
            [HideInInspector] public string entityDisplayName;
            public VulcanEntityDefinition entityDefinition;
            public GameObject prefab;
            public string[] candidatePrefabPaths = Array.Empty<string>();

            public string GetEntityTypeId() => entityDefinition != null ? entityDefinition.EntityTypeId : entityTypeId;

            public string GetEntityDisplayName() => entityDefinition != null ? entityDefinition.DisplayName : entityDisplayName;

            public void BindDefinition(VulcanEntityDefinition definition)
            {
                entityDefinition = definition;
                entityTypeId = definition != null ? definition.EntityTypeId : entityTypeId;
                entityDisplayName = definition != null ? definition.DisplayName : entityDisplayName;
            }
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
        [SerializeField] private PropertyDefinition[] tileMetadataDefinitions = Array.Empty<PropertyDefinition>();

        [Header("Mappings")]
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
        public PropertyDefinition[] TileMetadataDefinitions => tileMetadataDefinitions;
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
            PropertyDefinition[] metadataDefinitions = null)
        {
            version = fileVersion;
            projectName = name;
            tileSize = size;
            defaultMapWidth = mapWidth;
            defaultMapHeight = mapHeight;
            terrainTypes = terrains ?? Array.Empty<TerrainDefinition>();
            layerDefinitions = layers ?? Array.Empty<LayerDefinition>();
            tileMetadataDefinitions = metadataDefinitions ?? Array.Empty<PropertyDefinition>();
        }

        public void SetMappings(
            MapLocationMapping[] mapLocations,
            ItemClassMapping[] itemMappings,
            string[] warnings)
        {
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
    }
}

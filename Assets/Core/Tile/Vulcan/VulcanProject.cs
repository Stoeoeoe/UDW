using System;
using Core.Common;
using Newtonsoft.Json;
using UnityEngine;

namespace Core.Tile.Vulcanus
{
    /// <summary>A Vulcanus project's settings, read straight from its .vproj file.</summary>
    [CreateAssetMenu(fileName = "VulcanusProject", menuName = "Game/Vulcanus/Project")]
    public class VulcanusProject : ScriptableObject
    {
        [Serializable]
        public struct TerrainDefinition
        {
            public string id;
            public string displayName;
            [JsonConverter(typeof(HexColorJsonConverter))] public Color color;
        }

        [Serializable]
        public struct LayerDefinition
        {
            public string id;
            public string name;
            public string type;
            [JsonConverter(typeof(HexColorJsonConverter))] public Color color;
            public int zIndex;
        }

        [Serializable]
        public struct PropertyDefinition
        {
            public string key;
            public string label;
            public string type;
            [JsonConverter(typeof(RawJsonJsonConverter))] public string defaultValue;
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
        public struct DialogueTypeDefinition
        {
            public string id;
            public string name;
            public string description;
        }

        [SerializeField] private string version;
        [SerializeField, JsonProperty("name")] private string projectName;
        [SerializeField] private int tileSize;
        [SerializeField] private int defaultMapWidth;
        [SerializeField] private int defaultMapHeight;
        [SerializeField] private TerrainDefinition[] terrainTypes = Array.Empty<TerrainDefinition>();
        [SerializeField] private LayerDefinition[] layerDefinitions = Array.Empty<LayerDefinition>();
        [SerializeField] private PropertyDefinition[] tileMetadataDefinitions = Array.Empty<PropertyDefinition>();
        [SerializeField] private DialogueTypeDefinition[] dialogueTypes = Array.Empty<DialogueTypeDefinition>();

        [Header("Mappings")]
        [SerializeField, JsonProperty("itemClasses")] private ItemClassMapping[] itemClassMappings = Array.Empty<ItemClassMapping>();

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
        public DialogueTypeDefinition[] DialogueTypes => dialogueTypes;
        public ItemClassMapping[] ItemClassMappings => itemClassMappings;
        public string[] MappingWarnings => mappingWarnings;

        [Serializable]
        public class ItemClassMapping
        {
            [JsonProperty("id")] public string classId;
            public string className;
        }
    }
}

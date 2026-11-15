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

            public string GetEntityTypeId() => entityDefinition != null ? entityDefinition.Id : entityTypeId;

            public string GetEntityDisplayName() => entityDefinition != null ? entityDefinition.DisplayName : entityDisplayName;

            public void BindDefinition(VulcanEntityDefinition definition)
            {
                entityDefinition = definition;
                entityTypeId = definition != null ? definition.Id : entityTypeId;
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

        [field: SerializeField] public string Version { get; private set; }
        [field: SerializeField] public string Name { get; private set; }
        [field: SerializeField] public int TileSize { get; private set; }
        [field: SerializeField] public int DefaultMapWidth { get; private set; }
        [field: SerializeField] public int DefaultMapHeight { get; private set; }
        [field: SerializeField] public TerrainDefinition[] TerrainTypes { get; private set; } = Array.Empty<TerrainDefinition>();
        [field: SerializeField] public LayerDefinition[] LayerDefinitions { get; private set; } = Array.Empty<LayerDefinition>();
        [field: SerializeField] public PropertyDefinition[] TileMetadataDefinitions { get; private set; } = Array.Empty<PropertyDefinition>();
        [field: SerializeField] public DialogueTypeDefinition[] DialogueTypes { get; private set; } = Array.Empty<DialogueTypeDefinition>();

        [field: Header("Mappings")]
        [field: SerializeField] public ItemClassMapping[] ItemClasses { get; private set; } = Array.Empty<ItemClassMapping>();

        [field: Header("Importer Diagnostics")]
        [field: SerializeField] public string[] MappingWarnings { get; private set; } = Array.Empty<string>();

        [Serializable]
        public class ItemClassMapping
        {
            public string id;
            public string className;
        }
    }
}

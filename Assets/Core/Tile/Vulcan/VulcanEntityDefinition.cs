using System;
using Core.Common;
using Newtonsoft.Json;
using UnityEngine;

namespace Core.Tile.Vulcanus
{
    [CreateAssetMenu(fileName = "VulcanEntityDefinition", menuName = "Game/Vulcanus/Entity Definition")]
    public class VulcanEntityDefinition : ScriptableObject
    {
        [Serializable]
        public struct PropertyDefinition
        {
            public string key;
            public string label;
            public string type;
            [JsonConverter(typeof(RawJsonJsonConverter)), Tooltip("The default as JSON text.")] public string defaultValue;
            public bool required;
        }

        /// <summary>The sprite drawn in the editor, by path.</summary>
        [Serializable]
        public sealed class SpriteReference
        {
            public string path;
        }

        [field: SerializeField] public string Id { get; private set; }
        [field: SerializeField] public string DisplayName { get; private set; }
        [field: SerializeField] public string Category { get; private set; }
        [field: SerializeField] public string Group { get; private set; }
        [field: SerializeField] public string Description { get; private set; }
        [field: SerializeField, JsonConverter(typeof(HexColorJsonConverter))] public Color PlaceholderColor { get; private set; } = Color.gray;
        [field: SerializeField] public string Icon { get; private set; }
        [field: SerializeField] public string FolderPath { get; private set; }
        [field: SerializeField, JsonConverter(typeof(Vector2IntJsonConverter))] public Vector2Int DefaultSize { get; private set; } = Vector2Int.one;
        [field: SerializeField] public SpriteReference Sprite { get; private set; } = new();
        [field: SerializeField] public PropertyDefinition[] Properties { get; private set; } = Array.Empty<PropertyDefinition>();

        public string SpritePath => Sprite.path;
    }
}
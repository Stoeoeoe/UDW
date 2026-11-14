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

        [SerializeField] private string id;
        [SerializeField] private string displayName;
        [SerializeField] private string category;
        [SerializeField] private string group;
        [SerializeField] private string description;
        [SerializeField, JsonConverter(typeof(HexColorJsonConverter))] private Color placeholderColor = Color.gray;
        [SerializeField] private string icon;
        [SerializeField] private string folderPath;
        [SerializeField, JsonConverter(typeof(Vector2IntJsonConverter))] private Vector2Int defaultSize = Vector2Int.one;
        [SerializeField] private SpriteReference sprite = new();
        [SerializeField] private PropertyDefinition[] properties = Array.Empty<PropertyDefinition>();

        public string EntityTypeId => id;
        public string DisplayName => displayName;
        public string Category => category;
        public string Group => group;
        public string Description => description;
        public Color PlaceholderColor => placeholderColor;
        public string Icon => icon;
        public string FolderPath => folderPath;
        public Vector2Int DefaultSize => defaultSize;
        public string SpritePath => sprite.path;
        public PropertyDefinition[] Properties => properties;
    }
}
using System;
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
            public string defaultValue;
            public bool required;
        }

        [SerializeField] private string entityTypeId;
        [SerializeField] private string displayName;
        [SerializeField] private string category;
        [SerializeField] private string group;
        [SerializeField] private string description;
        [SerializeField] private Color placeholderColor = Color.gray;
        [SerializeField] private string placeholderIcon;
        [SerializeField] private string folderPath;
        [SerializeField] private Vector2Int defaultSize = Vector2Int.one;
        [SerializeField] private string spritePath;
        [SerializeField] private PropertyDefinition[] properties = Array.Empty<PropertyDefinition>();

        public string EntityTypeId => entityTypeId;
        public string DisplayName => displayName;
        public string Category => category;
        public string Group => group;
        public string Description => description;
        public Color PlaceholderColor => placeholderColor;
        public string PlaceholderIcon => placeholderIcon;
        public string FolderPath => folderPath;
        public Vector2Int DefaultSize => defaultSize;
        public string SpritePath => spritePath;
        public PropertyDefinition[] Properties => properties;

        public void Configure(
            string id,
            string entityDisplayName,
            string entityCategory,
            string entityGroup,
            string entityDescription,
            Color entityPlaceholderColor,
            string entityPlaceholderIcon,
            string entityFolderPath,
            Vector2Int entityDefaultSize,
            string entitySpritePath,
            PropertyDefinition[] entityProperties)
        {
            entityTypeId = id;
            displayName = entityDisplayName;
            category = entityCategory;
            group = entityGroup;
            description = entityDescription;
            placeholderColor = entityPlaceholderColor;
            placeholderIcon = entityPlaceholderIcon;
            folderPath = entityFolderPath;
            defaultSize = entityDefaultSize;
            spritePath = entitySpritePath;
            properties = entityProperties ?? Array.Empty<PropertyDefinition>();
        }
    }
}
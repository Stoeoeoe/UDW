using System;
using System.Linq;
using Core.Tile.Vulcanus;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class EntityDefinitionImporter
    {
        public static void ImportEntityDefinition(AssetImportContext ctx)
        {
            var dto = VulcanusImportHelpers.LoadDto<EntityTypeDto>(ctx.assetPath);
            var propertyDefinitions = dto.Properties?.Select(definition => new VulcanEntityDefinition.PropertyDefinition
            {
                key = definition.Key,
                label = definition.Label,
                type = definition.Type,
                defaultValue = definition.DefaultValue?.ToString(Newtonsoft.Json.Formatting.None),
                required = definition.Required
            }).ToArray() ?? Array.Empty<VulcanEntityDefinition.PropertyDefinition>();

            var defaultWidth = dto.DefaultSize != null && dto.DefaultSize.Count > 0 ? Math.Max(1, dto.DefaultSize[0]) : 1;
            var defaultHeight = dto.DefaultSize != null && dto.DefaultSize.Count > 1 ? Math.Max(1, dto.DefaultSize[1]) : 1;

            var definition = ScriptableObject.CreateInstance<VulcanEntityDefinition>();
            definition.name = VulcanusImportHelpers.GetBaseName(ctx.assetPath);
            definition.Configure(
                string.IsNullOrWhiteSpace(dto.Id) ? definition.name : dto.Id,
                string.IsNullOrWhiteSpace(dto.DisplayName) ? definition.name : dto.DisplayName,
                dto.Category,
                dto.Group,
                dto.Description,
                VulcanusImportHelpers.ParseHexColor(dto.PlaceholderColor, Color.gray),
                string.IsNullOrWhiteSpace(dto.PlaceholderIcon) ? dto.Icon : dto.PlaceholderIcon,
                dto.FolderPath,
                new Vector2Int(defaultWidth, defaultHeight),
                dto.Sprite?.Path,
                propertyDefinitions);

            ctx.AddObjectToAsset("entityDefinition", definition);
            ctx.SetMainObject(definition);
        }
    }
}

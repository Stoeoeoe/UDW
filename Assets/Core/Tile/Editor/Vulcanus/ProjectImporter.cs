using System;
using System.Collections.Generic;
using System.Linq;
using Core.Tile.Vulcanus;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class ProjectImporter
    {
        public static void ImportProject(AssetImportContext ctx)
        {
            var dto = VulcanusImportHelpers.LoadDto<ProjectDto>(ctx.assetPath);

            var terrainDefs = dto.TerrainTypes.Select(t => new VulcanusProject.TerrainDefinition
            {
                id = t.Id,
                displayName = t.DisplayName ?? t.Id,
                color = VulcanusImportHelpers.ParseHexColor(t.Color, Color.white),
                mappedTerrainType = VulcanusImportHelpers.MapTerrainIdToTerrainType(t.Id, null)
            }).ToArray();

            var layerDefs = dto.LayerDefinitions.Select(l => new VulcanusProject.LayerDefinition
            {
                id = l.Id,
                name = l.Name,
                type = l.Type,
                color = VulcanusImportHelpers.ParseHexColor(l.Color, Color.white),
                zIndex = l.ZIndex
            }).ToArray();

            var metadataDefs = dto.TileMetadataDefinitions?.Select(d => new VulcanusProject.PropertyDefinition
            {
                key = d.Key,
                label = d.Label,
                type = d.Type,
                defaultValue = d.DefaultValue?.ToString(Formatting.None),
                required = d.Required
            }).ToArray() ?? Array.Empty<VulcanusProject.PropertyDefinition>();

            var dialogueTypes = dto.DialogueTypes?.Select(d => new VulcanusProject.DialogueTypeDefinition
            {
                id = d.Id,
                name = d.Name,
                description = d.Description,
            }).ToArray() ?? Array.Empty<VulcanusProject.DialogueTypeDefinition>();

            var warnings = new List<string>();

            var project = ScriptableObject.CreateInstance<VulcanusProject>();
            project.name = VulcanusImportHelpers.GetBaseName(ctx.assetPath);
            project.Configure(
                dto.Version ?? "1.0",
                dto.Name ?? VulcanusImportHelpers.GetBaseName(ctx.assetPath),
                dto.TileSize > 0 ? dto.TileSize : 16,
                dto.DefaultMapWidth > 0 ? dto.DefaultMapWidth : 32,
                dto.DefaultMapHeight > 0 ? dto.DefaultMapHeight : 32,
                terrainDefs,
                layerDefs,
                metadataDefs);
            project.ConfigureDialogueTypes(dialogueTypes);

            VulcanusProject.ItemClassMapping[] itemMappings = Array.Empty<VulcanusProject.ItemClassMapping>();
            if (dto.ItemClasses != null && dto.ItemClasses.Count > 0)
            {
                itemMappings = dto.ItemClasses
                    .Select(ic => new VulcanusProject.ItemClassMapping
                    {
                        classId = ic.Id,
                        className = ic.ClassName,
                        candidateTypeNames = ic.Extra?.ContainsKey("candidates") == true &&
                                             ic.Extra["candidates"] is JArray arr
                            ? arr.Select(t => t.ToString()).ToArray()
                            : Array.Empty<string>()
                    })
                    .ToArray();
            }

            project.SetMappings(itemMappings, warnings.ToArray());

            ctx.AddObjectToAsset("project", project);
            ctx.SetMainObject(project);
        }

    }
}

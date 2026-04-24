using System;
using System.Linq;
using Core.Tile.Vulcanus;
using Newtonsoft.Json.Linq;
using UnityEditor;
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

            var entityDefs = dto.EntityTypes.Select(e => new VulcanusProject.EntityTypeDefinition
            {
                id = e.Id,
                displayName = e.DisplayName,
                category = e.Category,
                group = e.Group
            }).ToArray();

            var metadataDefs = dto.TileMetadataDefinitions?.Select(d => new VulcanusProject.PropertyDefinition
            {
                key = d.Key,
                label = d.Label,
                type = d.Type,
                defaultValue = d.DefaultValue?.ToString(Newtonsoft.Json.Formatting.None),
                required = d.Required
            }).ToArray() ?? Array.Empty<VulcanusProject.PropertyDefinition>();

            var previousProject = AssetDatabase.LoadAssetAtPath<VulcanusProject>(ctx.assetPath);
            var catalog = VulcanusProjectRegistry.FindWorldCatalogForProject(ctx.assetPath);

            var warnings = new System.Collections.Generic.List<string>();
            var existingEntityMappings =
                catalog != null ? catalog.EntityPrefabMappings : previousProject?.EntityPrefabMappings;
            var entityMappings = VulcanusEditorUtils.BuildEntityMappings(entityDefs, existingEntityMappings, warnings);

            var locationMappings = (catalog != null ? catalog.LocationMappings : previousProject?.LocationMappings)
                                   ?? Array.Empty<VulcanusProject.MapLocationMapping>();

            if (catalog != null)
                VulcanusImportHelpers.AddDependency(ctx, AssetDatabase.GetAssetPath(catalog));

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
                entityDefs,
                metadataDefs);

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

            project.SetMappings(entityMappings, locationMappings, itemMappings, warnings.ToArray());

            ctx.AddObjectToAsset("project", project);
            ctx.SetMainObject(project);
        }
    }
}

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

            var metadataDefs = dto.TileMetadataDefinitions?.Select(d => new VulcanusProject.PropertyDefinition
            {
                key = d.Key,
                label = d.Label,
                type = d.Type,
                defaultValue = d.DefaultValue?.ToString(Newtonsoft.Json.Formatting.None),
                required = d.Required
            }).ToArray() ?? Array.Empty<VulcanusProject.PropertyDefinition>();

            var dialogueTypes = dto.DialogueTypes?.Select(d => new VulcanusProject.DialogueTypeDefinition
            {
                id = d.Id,
                name = d.Name,
                description = d.Description,
                contextTypeId = d.ContextTypeId
            }).ToArray() ?? Array.Empty<VulcanusProject.DialogueTypeDefinition>();

            var gameVariables = dto.GameVariables?.Select(MapScriptValueDefinition).ToArray()
                                ?? Array.Empty<VulcanusProject.ScriptValueDefinition>();
            var scriptFunctions = dto.ScriptFunctions?.Select(MapScriptFunctionDefinition).ToArray()
                                  ?? Array.Empty<VulcanusProject.ScriptFunctionDefinition>();
            var scriptNamespaces = dto.ScriptNamespaces?.Select(n => new VulcanusProject.ScriptNamespaceDefinition
            {
                id = n.Id,
                name = n.Name,
                description = n.Description,
                fields = n.Fields?.Select(MapScriptValueDefinition).ToArray()
                         ?? Array.Empty<VulcanusProject.ScriptValueDefinition>(),
                functions = n.Functions?.Select(MapScriptFunctionDefinition).ToArray()
                            ?? Array.Empty<VulcanusProject.ScriptFunctionDefinition>()
            }).ToArray() ?? Array.Empty<VulcanusProject.ScriptNamespaceDefinition>();

            var scriptContextTypes = dto.ScriptContextTypes?.Select(c => new VulcanusProject.ScriptContextTypeDefinition
            {
                id = c.Id,
                name = c.Name,
                description = c.Description,
                fields = c.Fields?.Select(MapScriptValueDefinition).ToArray()
                         ?? Array.Empty<VulcanusProject.ScriptValueDefinition>(),
                functions = c.Functions?.Select(MapScriptFunctionDefinition).ToArray()
                            ?? Array.Empty<VulcanusProject.ScriptFunctionDefinition>()
            }).ToArray() ?? Array.Empty<VulcanusProject.ScriptContextTypeDefinition>();

            var previousProject = AssetDatabase.LoadAssetAtPath<VulcanusProject>(ctx.assetPath);
            var catalog = VulcanusProjectRegistry.FindWorldCatalogForProject(ctx.assetPath);

            var warnings = new System.Collections.Generic.List<string>();

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
                metadataDefs);
            project.ConfigureDialogueScripting(
                dto.DefaultDialogueContextTypeId,
                dialogueTypes,
                gameVariables,
                scriptFunctions,
                scriptNamespaces,
                scriptContextTypes);

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

            project.SetMappings(locationMappings, itemMappings, warnings.ToArray());

            ctx.AddObjectToAsset("project", project);
            ctx.SetMainObject(project);
        }

        private static VulcanusProject.ScriptValueDefinition MapScriptValueDefinition(GameVariableDto value)
        {
            return new VulcanusProject.ScriptValueDefinition
            {
                key = value?.Key ?? string.Empty,
                type = value?.Type ?? string.Empty,
                category = value?.Category ?? string.Empty,
                description = value?.Description ?? string.Empty,
                defaultValue = value?.DefaultValue?.ToString(Newtonsoft.Json.Formatting.None) ?? string.Empty,
                enumValues = value?.EnumValues?.ToArray() ?? Array.Empty<string>(),
                tableId = value?.TableId ?? string.Empty,
                folderPath = value?.FolderPath ?? string.Empty
            };
        }

        private static VulcanusProject.ScriptFunctionDefinition MapScriptFunctionDefinition(ScriptFunctionDto function)
        {
            return new VulcanusProject.ScriptFunctionDefinition
            {
                id = function?.Id ?? string.Empty,
                name = function?.Name ?? string.Empty,
                description = function?.Description ?? string.Empty,
                parameters = function?.Params?.Select(p => new VulcanusProject.ScriptParamDefinition
                {
                    name = p.Name,
                    type = p.Type,
                    description = p.Description,
                    enumValues = p.EnumValues?.ToArray() ?? Array.Empty<string>()
                }).ToArray() ?? Array.Empty<VulcanusProject.ScriptParamDefinition>(),
                returnType = function?.ReturnType ?? string.Empty,
                returnTableId = function?.ReturnTableId ?? string.Empty
            };
        }
    }
}

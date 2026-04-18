using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using Core.Location;
using Core.Tile.Vulcanus;
using Core.Inventory;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Core.Tile.Editor.Vulcanus
{
    [ScriptedImporter(2, new[] { "vproj", "vts", "vmap", "vitm" }, 6100)]
    public class VulcanusJsonImporter : ScriptedImporter
    {
        private const float DefaultOverlayAlpha = 0.5f;

        public override void OnImportAsset(AssetImportContext ctx)
        {
            try
            {
                if (ctx.assetPath.EndsWith(".vproj", StringComparison.OrdinalIgnoreCase))
                {
                    ImportProject(ctx);
                    return;
                }

                if (ctx.assetPath.EndsWith(".vts", StringComparison.OrdinalIgnoreCase))
                {
                    ImportTileset(ctx);
                    return;
                }

                if (ctx.assetPath.EndsWith(".vmap", StringComparison.OrdinalIgnoreCase))
                {
                    ImportMap(ctx);
                    return;
                }

                if (ctx.assetPath.EndsWith(".vitm", StringComparison.OrdinalIgnoreCase))
                {
                    ImportItem(ctx);
                    return;
                }

                ImportAsText(ctx);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[VulcanusJsonImporter] Failed importing '{ctx.assetPath}'.\n{ex}");
                ImportAsText(ctx);
            }
        }

        private static void ImportAsText(AssetImportContext ctx)
        {
            var text = new TextAsset(File.ReadAllText(ToAbsolutePath(ctx.assetPath)));
            text.name = Path.GetFileNameWithoutExtension(ctx.assetPath);
            ctx.AddObjectToAsset("text", text);
            ctx.SetMainObject(text);
        }

        // ── Project ───────────────────────────────────────────────────────────

        private void ImportProject(AssetImportContext ctx)
        {
            var dto = LoadDto<ProjectDto>(ctx.assetPath);

            var terrainDefs = dto.TerrainTypes.Select(t => new VulcanusProject.TerrainDefinition
            {
                id = t.Id,
                displayName = t.DisplayName ?? t.Id,
                color = ParseHexColor(t.Color, Color.white),
                mappedTerrainType = MapTerrainIdToTerrainType(t.Id, null)
            }).ToArray();

            var layerDefs = dto.LayerDefinitions.Select(l => new VulcanusProject.LayerDefinition
            {
                id = l.Id,
                name = l.Name,
                type = l.Type,
                color = ParseHexColor(l.Color, Color.white),
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

            var warnings = new List<string>();
            var existingEntityMappings =
                catalog != null ? catalog.EntityPrefabMappings : previousProject?.EntityPrefabMappings;
            var entityMappings = VulcanusEditorUtils.BuildEntityMappings(entityDefs, existingEntityMappings, warnings);

            var locationMappings = (catalog != null ? catalog.LocationMappings : previousProject?.LocationMappings)
                                   ?? Array.Empty<VulcanusProject.MapLocationMapping>();

            if (catalog != null)
                AddDependency(ctx, AssetDatabase.GetAssetPath(catalog));

            var project = ScriptableObject.CreateInstance<VulcanusProject>();
            project.name = GetBaseName(ctx.assetPath);
            project.Configure(
                dto.Version ?? "1.0",
                dto.Name ?? GetBaseName(ctx.assetPath),
                dto.TileSize > 0 ? dto.TileSize : 16,
                dto.DefaultMapWidth > 0 ? dto.DefaultMapWidth : 32,
                dto.DefaultMapHeight > 0 ? dto.DefaultMapHeight : 32,
                terrainDefs,
                layerDefs,
                entityDefs,
                metadataDefs);

            // Build item-class mappings from project DTO (classId -> CLR type name candidates)
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

        // ── Tileset ───────────────────────────────────────────────────────────

        private void ImportTileset(AssetImportContext ctx)
        {
            var dto = LoadDto<TilesetDto>(ctx.assetPath);

            var projectAssetPath = FindProjectAssetPath(ctx.assetPath);
            VulcanusProject project = null;
            var tileSize = 16;
            if (!string.IsNullOrEmpty(projectAssetPath))
            {
                AddDependency(ctx, projectAssetPath);
                project = AssetDatabase.LoadAssetAtPath<VulcanusProject>(projectAssetPath);
                tileSize = project != null ? Mathf.Max(1, project.TileSize) : GetProjectTileSize(projectAssetPath);
            }

            var tilesetId = !string.IsNullOrEmpty(dto.Id) ? dto.Id : GetBaseName(ctx.assetPath);
            var displayName = !string.IsNullOrEmpty(dto.Name) ? dto.Name : tilesetId;
            var columns = Math.Max(1, dto.Columns);
            var tileCount = Math.Max(0, dto.TileCount);

            var spriteSheetAssetPath = ResolveAssetReferencePath(ctx.assetPath, dto.SpriteSheet, projectAssetPath);
            if (!string.IsNullOrEmpty(spriteSheetAssetPath))
                AddDependency(ctx, spriteSheetAssetPath);

            var texture = !string.IsNullOrEmpty(spriteSheetAssetPath)
                ? AssetDatabase.LoadAssetAtPath<Texture2D>(spriteSheetAssetPath)
                : null;

            var tiles = new VulcanusTile[tileCount];
            for (var i = 0; i < tileCount; i++)
            {
                var tile = ScriptableObject.CreateInstance<VulcanusTile>();
                tile.name = $"tile_{i:D4}";

                dto.Tiles.TryGetValue(i.ToString(), out var meta);
                var terrainId = meta?.Terrain ?? GetFirstTerrainCorner(meta);
                var tags = meta?.Tags?.ToArray() ?? Array.Empty<string>();
                var collisionKind = ParseCollisionKind(meta?.Collision);
                var tileId = !string.IsNullOrEmpty(meta?.Id) ? meta.Id : $"{tilesetId}_{i}";
                Core.Tile.Vulcanus.VulcanusTile.VulcanusTileProperty[] metaProps = null;
                if (meta?.Properties != null && meta.Properties.Count > 0)
                {
                    var list = new List<Core.Tile.Vulcanus.VulcanusTile.VulcanusTileProperty>();
                    for (int p = 0; p < meta.Properties.Count; p++)
                    {
                        var pi = meta.Properties[p];
                        if (pi == null) continue;

                        // Attempt to apply the property directly to the VulcanusTile instance
                        // if a matching field/property (case-insensitive) exists. If applied,
                        // do not store in the fallback Properties bag.
                        var applied = TryApplyPropertyToObject(tile, pi.Key, pi.Value);
                        if (applied)
                            continue;

                        // Fallback: store as JSON string in the serializable property bag.
                        var vp = new Core.Tile.Vulcanus.VulcanusTile.VulcanusTileProperty
                        {
                            key = pi?.Key,
                            jsonValue = pi?.Value != null ? pi.Value.ToString(Newtonsoft.Json.Formatting.None) : null
                        };
                        list.Add(vp);
                    }

                    if (list.Count > 0)
                        metaProps = list.ToArray();
                }

                var sprite = CreateSpriteForTile(texture, columns, tileSize, i);
                if (sprite != null)
                {
                    sprite.name = $"sprite_{i:D4}";
                    ctx.AddObjectToAsset($"sprite_{i}", sprite);
                    tile.sprite = sprite;
                }

                tile.Configure(i, tileId, terrainId, MapTerrainIdToTerrainType(terrainId, project), tags, collisionKind,
                    metaProps);
                tiles[i] = tile;
                ctx.AddObjectToAsset($"tile_{i}", tile);
            }

            var tileset = ScriptableObject.CreateInstance<VulcanusTilesetAsset>();
            tileset.name = displayName;
            tileset.Configure(tilesetId, displayName, texture, columns, tileCount, tileSize, tiles);

            ctx.AddObjectToAsset("tileset", tileset);
            ctx.SetMainObject(tileset);
        }

        // ── Map ───────────────────────────────────────────────────────────────

        private void ImportMap(AssetImportContext ctx)
        {
            var dto = LoadDto<MapDto>(ctx.assetPath);

            var projectAssetPath = FindProjectAssetPath(ctx.assetPath);
            VulcanusProject project = null;
            VulcanusWorldCatalog catalog = null;
            var tileSize = 16;
            if (!string.IsNullOrEmpty(projectAssetPath))
            {
                AddDependency(ctx, projectAssetPath);
                project = AssetDatabase.LoadAssetAtPath<VulcanusProject>(projectAssetPath);
                tileSize = project != null ? Mathf.Max(1, project.TileSize) : GetProjectTileSize(projectAssetPath);
                catalog = VulcanusProjectRegistry.FindWorldCatalogForProject(projectAssetPath);
            }

            var mapId = !string.IsNullOrEmpty(dto.Id) ? dto.Id : GetBaseName(ctx.assetPath);
            var mapName = !string.IsNullOrEmpty(dto.Name) ? dto.Name : mapId;
            var width = Math.Max(1, dto.Width);
            var height = Math.Max(1, dto.Height);

            var tilesetsByIndex = new List<VulcanusTilesetAsset>();
            foreach (var refId in dto.TilesetRefs)
            {
                var tilesetAssetPath = FindTilesetById(ctx.assetPath, refId, projectAssetPath);
                if (!string.IsNullOrEmpty(tilesetAssetPath))
                {
                    AddDependency(ctx, tilesetAssetPath);
                    tilesetsByIndex.Add(AssetDatabase.LoadAssetAtPath<VulcanusTilesetAsset>(tilesetAssetPath));
                }
                else
                {
                    tilesetsByIndex.Add(null);
                }
            }

            var mapRoot = new GameObject(string.IsNullOrEmpty(mapName) ? mapId : mapName);
            var mapComponent = mapRoot.AddComponent<VulcanusImportedMap>();

            var gridGo = new GameObject("Grid");
            gridGo.transform.SetParent(mapRoot.transform, false);
            var grid = gridGo.AddComponent<Grid>();
            grid.cellLayout = GridLayout.CellLayout.Rectangle;
            grid.cellSize = Vector3.one;

            Tilemap terrainTilemap = null;
            Tilemap farmlandTilemap = null;
            var terrainCells = new List<VulcanusImportedMap.TerrainCell>();

            foreach (var layer in dto.Layers)
            {
                if (!layer.Visible) continue;

                if (layer.Data == null)
                {
                    SpawnEntities(mapRoot.transform, layer.Entities, $"{layer.Name}_Entities", height, tileSize,
                        catalog, ctx);
                    continue;
                }

                var tilemap = CreateTilemapLayer(gridGo.transform, layer.Name, layer.ZOrder, layer.Opacity);
                PopulateTileLayer(tilemap, layer.Data, height, tilesetsByIndex);

                var isTerrain = layer.Kind.Equals("terrain", StringComparison.OrdinalIgnoreCase);
                if (terrainTilemap == null && isTerrain) terrainTilemap = tilemap;
                if (farmlandTilemap == null && layer.Name.Equals("FarmLand", StringComparison.OrdinalIgnoreCase))
                    farmlandTilemap = tilemap;

                if (isTerrain) ExtractTerrainCells(layer, height, terrainCells, project);

                SpawnEntities(mapRoot.transform, layer.Entities, $"{layer.Name}_Entities", height, tileSize, catalog,
                    ctx);
            }

            SpawnEntities(mapRoot.transform, dto.Entities, "Entities", height, tileSize, catalog, ctx);

            var anchorsById = VulcanusMapTriggerImporter.SpawnAnchors(
                mapRoot.transform,
                dto.SpatialPrimitives?.Anchors,
                height,
                tileSize);
            VulcanusMapTriggerImporter.SpawnTriggers(
                mapRoot.transform,
                dto.LocationLinks,
                dto.SpatialPrimitives?.Triggers,
                anchorsById,
                height,
                tileSize,
                catalog);

            var plowedTilemap = CreateTilemapLayer(gridGo.transform, "FarmLand_Plowed", 10, DefaultOverlayAlpha);
            var irrigatedTilemap = CreateTilemapLayer(gridGo.transform, "FarmLand_Irrigated", 11, DefaultOverlayAlpha);
            var overlayTilemap = CreateTilemapLayer(gridGo.transform, "Overlay", 999, DefaultOverlayAlpha);

            if (terrainTilemap == null)
                terrainTilemap = CreateTilemapLayer(gridGo.transform, "Terrain", 0, 1f);

            mapComponent.Configure(mapId, mapName, width, height, tileSize);
            mapComponent.SetTilemaps(terrainTilemap, farmlandTilemap, plowedTilemap, irrigatedTilemap, overlayTilemap);
            mapComponent.SetTerrainCells(terrainCells.ToArray());

            ctx.AddObjectToAsset("map", mapRoot);
            ctx.SetMainObject(mapRoot);

            ctx.AddObjectToAsset("locationData", BuildLocationData(mapId, mapName, dto.Metadata));
        }

        private static LocationData BuildLocationData(string mapId, string mapName, MapMetadataDto metadata)
        {
            var locationData = ScriptableObject.CreateInstance<LocationData>();
            locationData.name = "LocationData_" + mapId;
            locationData.id = mapId;
            locationData.label = mapName;

            // Apply any extra metadata keys that match fields on LocationData by name (case-insensitive).
            if (metadata?.Extra != null)
            {
                foreach (var (key, token) in metadata.Extra)
                    TryApplyPropertyToObject(locationData, key, token);
            }

            return locationData;
        }

        // ── Item import ─────────────────────────────────────────────────────

        private void ImportItem(AssetImportContext ctx)
        {
            var dto = LoadDto<ItemDto>(ctx.assetPath);

            var projectAssetPath = FindProjectAssetPath(ctx.assetPath);
            ProjectDto projectDto = null;
            VulcanusProject projectAsset = null;
            if (!string.IsNullOrEmpty(projectAssetPath))
            {
                try
                {
                    AddDependency(ctx, projectAssetPath);
                    projectDto = LoadDto<ProjectDto>(projectAssetPath);
                }
                catch
                {
                    /* best-effort */
                }

                try
                {
                    projectAsset = AssetDatabase.LoadAssetAtPath<VulcanusProject>(projectAssetPath);
                }
                catch
                {
                    projectAsset = null;
                }
            }

            ItemClassDto classDto = null;
            if (!string.IsNullOrEmpty(dto.ClassId))
            {
                if (projectAsset != null && projectAsset.ItemClassMappings != null)
                {
                    var mapping = projectAsset.ItemClassMappings.FirstOrDefault(x =>
                        string.Equals(x.classId, dto.ClassId, StringComparison.OrdinalIgnoreCase));
                    if (mapping != null)
                        classDto = new ItemClassDto
                        {
                            Id = mapping.classId, ClassName = mapping.className,
                            Extra = new Dictionary<string, JToken>()
                        };
                }

                if (classDto == null && projectDto?.ItemClasses != null)
                    classDto = projectDto.ItemClasses.FirstOrDefault(c =>
                        string.Equals(c.Id, dto.ClassId, StringComparison.OrdinalIgnoreCase));
            }

            Type itemType = null;
            if (classDto != null && !string.IsNullOrWhiteSpace(classDto.ClassName))
                itemType = ResolveTypeByName(classDto.ClassName);

            if (itemType == null && projectAsset != null && projectAsset.ItemClassMappings != null)
            {
                var mapping = projectAsset.ItemClassMappings.FirstOrDefault(x =>
                    string.Equals(x.classId, dto.ClassId, StringComparison.OrdinalIgnoreCase));
                if (mapping != null && mapping.candidateTypeNames != null)
                {
                    foreach (var candidate in mapping.candidateTypeNames)
                    {
                        itemType = ResolveTypeByName(candidate);
                        if (itemType != null)
                            break;
                    }
                }
            }

            if (itemType == null || !typeof(ItemDefinition).IsAssignableFrom(itemType) || itemType.IsAbstract)
            {
                Debug.LogError(
                    $"[VulcanusJsonImporter] Could not resolve ItemDefinition class '{classDto?.ClassName}' for item '{dto.Id}'. Importing as text fallback.");
                ImportAsText(ctx);
                return;
            }

            var item = (ScriptableObject)ScriptableObject.CreateInstance(itemType);
            item.name = !string.IsNullOrEmpty(dto.Id) ? dto.Id : GetBaseName(ctx.assetPath);

            TrySetMemberValue(item, "ItemId", dto.Id);
            TrySetMemberValue(item, "ItemName", dto.Name);
            TrySetMemberValue(item, "Category", dto.Category);
            TrySetMemberValue(item, "Description", dto.Description);
            TrySetMemberValue(item, "MaxStackSize", dto.MaxStackSize);

            var iconAssetPath = ResolveAssetReferencePath(ctx.assetPath, dto.Icon, projectAssetPath);
            if (!string.IsNullOrEmpty(iconAssetPath))
            {
                AddDependency(ctx, iconAssetPath);
                var sprite = AssetDatabase.LoadAssetAtPath<Sprite>(iconAssetPath);
                if (sprite != null)
                    TrySetMemberValue(item, "Icon", sprite);
            }

            if (!string.IsNullOrWhiteSpace(dto.PickupSound))
            {
                var soundPath = ResolveAssetReferencePath(ctx.assetPath, dto.PickupSound, projectAssetPath);
                if (!string.IsNullOrEmpty(soundPath))
                {
                    AddDependency(ctx, soundPath);
                    var clip = AssetDatabase.LoadAssetAtPath<AudioClip>(soundPath);
                    if (clip != null)
                        TrySetMemberValue(item, "PickupSound", clip);
                }
            }

            if (dto.ClassProperties != null && dto.ClassProperties.Count > 0)
            {
                foreach (var kv in dto.ClassProperties)
                    TryApplyPropertyToObject(item, kv.Key, kv.Value);
            }

            ctx.AddObjectToAsset("item", item);
            ctx.SetMainObject(item);
        }

        // ── Terrain / layer parsing ───────────────────────────────────────────

        private static void ExtractTerrainCells(
            LayerDto layer,
            int mapHeight,
            List<VulcanusImportedMap.TerrainCell> terrainCells,
            VulcanusProject project)
        {
            if (layer.TerrainData == null)
                return;

            var palette = layer.TerrainPalette?.ToArray() ?? Array.Empty<string>();
            for (var y = 0; y < layer.TerrainData.Count; y++)
            {
                var row = layer.TerrainData[y] as JArray;
                if (row == null)
                    continue;

                for (var x = 0; x < row.Count; x++)
                {
                    var terrainId = ResolveTerrainId(row[x], palette);
                    if (string.IsNullOrEmpty(terrainId))
                        continue;

                    terrainCells.Add(new VulcanusImportedMap.TerrainCell
                    {
                        x = x,
                        y = mapHeight - 1 - y,
                        terrainId = terrainId,
                        terrainType = MapTerrainIdToTerrainType(terrainId, project)
                    });
                }
            }
        }

        private static string ResolveTerrainId(JToken token, string[] palette)
        {
            if (token == null || token.Type == JTokenType.Null)
                return null;

            if (token.Type == JTokenType.String)
                return token.Value<string>();

            if (!TryReadInt(token, out var index) || index < 0 || index >= palette.Length)
                return null;

            return palette[index];
        }

        // ── Tile layer population ─────────────────────────────────────────────

        private static void PopulateTileLayer(
            Tilemap tilemap,
            JToken dataToken,
            int mapHeight,
            IList<VulcanusTilesetAsset> tilesetsByIndex)
        {
            if (dataToken is JArray rows)
            {
                for (var y = 0; y < rows.Count; y++)
                {
                    var row = rows[y] as JArray;
                    if (row == null)
                        continue;

                    for (var x = 0; x < row.Count; x++)
                    {
                        if (!TryReadInt(row[x], out var encodedTile))
                            continue;

                        var tile = ResolveTile(encodedTile, tilesetsByIndex);
                        if (tile != null)
                            tilemap.SetTile(new Vector3Int(x, mapHeight - 1 - y, 0), tile);
                    }
                }

                return;
            }

            if (dataToken is not JObject sparse || sparse.Value<bool?>("sparse") != true)
                return;

            var entries = sparse["entries"] as JArray;
            if (entries == null)
                return;

            foreach (var entry in entries.OfType<JObject>())
            {
                if (!TryReadInt(entry["x"], out var x) ||
                    !TryReadInt(entry["y"], out var y) ||
                    !TryReadInt(entry["v"], out var encodedTile))
                    continue;

                var tile = ResolveTile(encodedTile, tilesetsByIndex);
                if (tile != null)
                    tilemap.SetTile(new Vector3Int(x, mapHeight - 1 - y, 0), tile);
            }
        }

        private static VulcanusTile ResolveTile(int encodedTile, IList<VulcanusTilesetAsset> tilesetsByIndex)
        {
            if (encodedTile < 0)
                return null;

            var tilesetIndex = encodedTile >> 16;
            var tileIndex = encodedTile & 0xFFFF;
            if (tilesetIndex >= tilesetsByIndex.Count)
                return null;

            var tileset = tilesetsByIndex[tilesetIndex];
            return tileset != null && tileset.TryGetTile(tileIndex, out var tile) ? tile : null;
        }

        // ── Entity / location-link spawning ───────────────────────────────────

        private static void SpawnEntities(
            Transform mapRoot,
            IReadOnlyList<EntityInstanceDto> entities,
            string groupName,
            int mapHeight,
            int tileSize,
            VulcanusWorldCatalog catalog,
            AssetImportContext ctx)
        {
            if (entities == null || entities.Count == 0)
                return;

            var group = new GameObject(groupName);
            group.transform.SetParent(mapRoot, false);

            foreach (var dto in entities)
                SpawnEntityInstance(group.transform, dto, mapHeight, tileSize, catalog, ctx);
        }

        private static void SpawnEntityInstance(
            Transform parent,
            EntityInstanceDto dto,
            int mapHeight,
            int tileSize,
            VulcanusWorldCatalog catalog,
            AssetImportContext ctx)
        {
            var px = dto.Position != null && dto.Position.Count > 0 ? dto.Position[0] : 0f;
            var py = dto.Position != null && dto.Position.Count > 1 ? dto.Position[1] : 0f;

            var entityData = new VulcanusEntityInstanceData
            {
                id = !string.IsNullOrEmpty(dto.Id) ? dto.Id : Guid.NewGuid().ToString("N"),
                typeId = dto.TypeId ?? string.Empty,
                layerId = dto.LayerId ?? string.Empty,
                label = dto.Label ?? string.Empty,
                pixelPosition = new Vector2(px, py),
                rotationDegrees = dto.Rotation,
                propertiesJson = JsonConvert.SerializeObject(dto.Properties ?? new JObject())
            };

            var ts = Mathf.Max(1, tileSize);
            var worldPos = new Vector3(px / ts, (mapHeight * ts - py) / ts, 0f);
            var worldRot = Quaternion.Euler(0f, 0f, -entityData.rotationDegrees);

            GameObject prefab = null;
            catalog?.TryGetEntityPrefab(entityData.typeId, out prefab);

            if (prefab != null)
            {
                AddDependency(ctx, AssetDatabase.GetAssetPath(prefab));
                var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab, parent);
                instance.name = $"{prefab.name}_{entityData.id}";
                instance.transform.localPosition = worldPos;
                instance.transform.localRotation = worldRot;
                VulcanusEntityInitializer.InitializeEntity(instance, entityData);
                return;
            }

            var placeholder = new GameObject($"Unmapped_{entityData.typeId}_{entityData.id}");
            placeholder.transform.SetParent(parent, false);
            placeholder.transform.localPosition = worldPos;
            placeholder.transform.localRotation = worldRot;
            Debug.LogWarning(
                $"[VulcanusImporter] No prefab mapped for entity type '{entityData.typeId}' (id: {entityData.id}). Assign it in VulcanusWorldCatalog.");
        }

        // ── Tilemap helpers ───────────────────────────────────────────────────

        private static Tilemap CreateTilemapLayer(Transform parent, string layerName, int sortingOrder, float opacity)
        {
            var go = new GameObject(layerName);
            go.transform.SetParent(parent, false);

            var tilemap = go.AddComponent<Tilemap>();
            tilemap.color = new Color(1f, 1f, 1f, Mathf.Clamp01(opacity));

            var renderer = go.AddComponent<TilemapRenderer>();
            renderer.sortOrder = TilemapRenderer.SortOrder.TopLeft;
            renderer.sortingOrder = sortingOrder;

            return tilemap;
        }

        private static void TryAddTriggerDebugger(GameObject go)
        {
            try
            {
                // Try both legacy and current namespaces for TriggerDebugger
                var dbgType = ResolveTypeByName("Core.Tile.Vulcan.TriggerDebugger") ??
                              ResolveTypeByName("Core.Tile.TriggerDebugger");
                if (dbgType != null && go.GetComponent(dbgType) == null)
                    go.AddComponent(dbgType);
            }
            catch
            {
                // best-effort editor-only visualization
            }
        }

        // ── Sprite creation ───────────────────────────────────────────────────

        private static Sprite CreateSpriteForTile(Texture2D texture, int columns, int tileSize, int tileIndex)
        {
            if (texture == null || tileSize <= 0 || columns <= 0) return null;

            var x = (tileIndex % columns) * tileSize;
            var y = texture.height - ((tileIndex / columns + 1) * tileSize);
            if (x < 0 || y < 0 || x + tileSize > texture.width || y + tileSize > texture.height) return null;

            return Sprite.Create(texture, new Rect(x, y, tileSize, tileSize), new Vector2(0.5f, 0.5f), tileSize, 0,
                SpriteMeshType.FullRect);
        }

        // ── Tile meta helpers ─────────────────────────────────────────────────

        private static string GetFirstTerrainCorner(TileMetaDto meta)
        {
            if (meta?.TerrainCorners == null) return null;
            return meta.TerrainCorners.FirstOrDefault(c => !string.IsNullOrEmpty(c));
        }

        private static VulcanusCollisionKind ParseCollisionKind(CollisionDto collision)
        {
            if (collision == null) return VulcanusCollisionKind.None;
            if (collision.Type.Equals("full", StringComparison.OrdinalIgnoreCase)) return VulcanusCollisionKind.Full;
            if (collision.Type.Equals("complex", StringComparison.OrdinalIgnoreCase))
                return VulcanusCollisionKind.Complex;
            return VulcanusCollisionKind.None;
        }

        private static TerrainType MapTerrainIdToTerrainType(string terrainId, VulcanusProject project)
        {
            if (project != null && project.TryMapTerrainId(terrainId, out var mapped)) return mapped;
            if (string.IsNullOrWhiteSpace(terrainId)) return TerrainType.Invalid;

            if (terrainId.Equals("grass", StringComparison.OrdinalIgnoreCase)) return TerrainType.Grass;
            if (terrainId.Equals("dirt", StringComparison.OrdinalIgnoreCase) ||
                terrainId.Equals("soil", StringComparison.OrdinalIgnoreCase)) return TerrainType.Dirt;
            if (terrainId.Equals("sand", StringComparison.OrdinalIgnoreCase)) return TerrainType.Sand;
            if (terrainId.Equals("water", StringComparison.OrdinalIgnoreCase)) return TerrainType.Water;

            return TerrainType.Invalid;
        }

        private static Color ParseHexColor(string hex, Color fallback) =>
            !string.IsNullOrEmpty(hex) && ColorUtility.TryParseHtmlString(hex, out var color) ? color : fallback;

        // ── Low-level JSON helpers ────────────────────────────────────────────

        private static bool TryReadInt(JToken token, out int value)
        {
            value = 0;
            if (token == null || token.Type == JTokenType.Null) return false;
            if (token.Type == JTokenType.Integer)
            {
                value = token.Value<int>();
                return true;
            }

            if (token.Type == JTokenType.Float)
            {
                value = Mathf.RoundToInt(token.Value<float>());
                return true;
            }

            if (token.Type != JTokenType.String) return false;
            return int.TryParse(token.Value<string>(), NumberStyles.Integer, CultureInfo.InvariantCulture, out value);
        }

        // ── Path utilities ────────────────────────────────────────────────────

        private static T LoadDto<T>(string assetPath) =>
            JsonConvert.DeserializeObject<T>(File.ReadAllText(ToAbsolutePath(assetPath)));

        private static string GetBaseName(string assetPath)
        {
            var fileName = Path.GetFileName(assetPath);
            if (fileName.EndsWith(".vmap", StringComparison.OrdinalIgnoreCase)) return fileName[..^".vmap".Length];
            if (fileName.EndsWith(".vts", StringComparison.OrdinalIgnoreCase)) return fileName[..^".vts".Length];
            if (fileName.EndsWith(".vproj", StringComparison.OrdinalIgnoreCase)) return fileName[..^".vproj".Length];
            if (fileName.EndsWith(".vitm", StringComparison.OrdinalIgnoreCase)) return fileName[..^".vitm".Length];
            return Path.GetFileNameWithoutExtension(fileName);
        }

        private static string FindProjectAssetPath(string assetPath)
        {
            var directory = Path.GetDirectoryName(ToAbsolutePath(assetPath));
            while (!string.IsNullOrEmpty(directory))
            {
                var canonical = Path.Combine(directory, "vproj");
                if (File.Exists(canonical) && TryAbsoluteToAssetPath(canonical, out var canonicalPath))
                    return canonicalPath;

                var generic = Directory
                    .GetFiles(directory, "*.vproj", SearchOption.TopDirectoryOnly)
                    .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
                    .FirstOrDefault(p => TryAbsoluteToAssetPath(p, out _));

                if (generic != null && TryAbsoluteToAssetPath(generic, out var genericPath))
                    return genericPath;

                directory = Path.GetDirectoryName(directory);
            }

            return null;
        }

        private static int GetProjectTileSize(string projectAssetPath)
        {
            try
            {
                var dto = LoadDto<ProjectDto>(projectAssetPath);
                return Math.Max(1, dto.TileSize > 0 ? dto.TileSize : 16);
            }
            catch (Exception ex)
            {
                Debug.LogWarning(
                    $"[VulcanusJsonImporter] Could not read tileSize from '{projectAssetPath}': {ex.Message}");
                return 16;
            }
        }

        private static string FindTilesetById(string mapAssetPath, string tilesetId, string projectAssetPath)
        {
            if (string.IsNullOrEmpty(tilesetId)) return null;

            var mapFolder = Path.GetDirectoryName(ToAbsolutePath(mapAssetPath));
            var projectRoot = !string.IsNullOrEmpty(projectAssetPath)
                ? Path.GetDirectoryName(ToAbsolutePath(projectAssetPath))
                : Path.GetDirectoryName(mapFolder) ?? mapFolder;

            var canonical = Path.Combine(projectRoot, "tilesets", $"{tilesetId}.vts");
            if (File.Exists(canonical) && TryAbsoluteToAssetPath(canonical, out var canonicalAssetPath))
                return canonicalAssetPath;

            foreach (var filePath in Directory.GetFiles(projectRoot, "*.vts", SearchOption.AllDirectories)
                         .OrderBy(p => p))
            {
                try
                {
                    var dto = LoadDto<TilesetDto>(filePath);
                    if (!string.Equals(dto.Id, tilesetId, StringComparison.OrdinalIgnoreCase)) continue;
                    if (TryAbsoluteToAssetPath(filePath, out var path)) return path;
                }
                catch
                {
                    /* ignore malformed tileset candidates */
                }
            }

            return null;
        }

        private static string ResolveAssetReferencePath(string ownerAssetPath, string relativePath,
            string projectAssetPath)
        {
            if (string.IsNullOrWhiteSpace(relativePath)) return null;
            if (TryResolveRelative(ownerAssetPath, relativePath, out var byOwner)) return byOwner;
            if (!string.IsNullOrEmpty(projectAssetPath) &&
                TryResolveRelative(projectAssetPath, relativePath, out var byProject)) return byProject;

            if (!string.IsNullOrEmpty(projectAssetPath))
            {
                var projectRoot = Path.GetDirectoryName(ToAbsolutePath(projectAssetPath));
                var targetFileName = Path.GetFileName(relativePath);
                if (!string.IsNullOrWhiteSpace(projectRoot) && !string.IsNullOrWhiteSpace(targetFileName) &&
                    Directory.Exists(projectRoot))
                {
                    var candidate = Directory
                        .GetFiles(projectRoot, targetFileName, SearchOption.AllDirectories)
                        .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
                        .FirstOrDefault(p => TryAbsoluteToAssetPath(p, out _));

                    if (candidate != null && TryAbsoluteToAssetPath(candidate, out var fallbackPath))
                        return fallbackPath;
                }
            }

            return null;
        }

        private static bool TryResolveRelative(string ownerAssetPath, string relativePath, out string resolvedAssetPath)
        {
            resolvedAssetPath = null;
            var ownerDir = Path.GetDirectoryName(ToAbsolutePath(ownerAssetPath));
            if (string.IsNullOrEmpty(ownerDir)) return false;

            var absolute = Path.IsPathRooted(relativePath)
                ? Path.GetFullPath(relativePath)
                : Path.GetFullPath(Path.Combine(ownerDir, relativePath));

            if (!File.Exists(absolute)) return false;
            return TryAbsoluteToAssetPath(absolute, out resolvedAssetPath);
        }

        private static void AddDependency(AssetImportContext ctx, string assetPath)
        {
            if (string.IsNullOrEmpty(assetPath)) return;
            ctx.DependsOnSourceAsset(assetPath);
            ctx.DependsOnArtifact(assetPath);
        }

        internal static string ToAbsolutePath(string path) =>
            Path.IsPathRooted(path)
                ? Path.GetFullPath(path)
                : Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), path));

        internal static bool TryAbsoluteToAssetPath(string absolutePath, out string assetPath)
        {
            var normalizedAbsolute = Path.GetFullPath(absolutePath).Replace('\\', '/');
            var assetsRoot = Path.GetFullPath(Application.dataPath).Replace('\\', '/');

            if (normalizedAbsolute.StartsWith(assetsRoot, StringComparison.OrdinalIgnoreCase))
            {
                assetPath = "Assets" + normalizedAbsolute[assetsRoot.Length..];
                return true;
            }

            assetPath = null;
            return false;
        }

        private static bool TryApplyPropertyToObject(object target, string key, JToken token)
        {
            if (target == null || string.IsNullOrWhiteSpace(key) || token == null) return false;

            var type = target.GetType();
            var flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.IgnoreCase;

            var field = type.GetField(key, flags);
            PropertyInfo prop = null;
            FieldInfo backingField = null;
            if (field == null)
            {
                prop = type.GetProperty(key, flags);
                if (prop == null)
                {
                    // Try auto-property backing field pattern
                    var backingName = $"<{key}>k__BackingField";
                    backingField = type.GetField(backingName, flags);
                }
            }

            if (field == null && prop == null && backingField == null) return false;

            Type targetType = field != null
                ? field.FieldType
                : (backingField != null ? backingField.FieldType : prop.PropertyType);

            object value = null;
            try
            {
                if (targetType == typeof(bool) || targetType == typeof(bool?))
                {
                    if (token.Type == JTokenType.Boolean)
                        value = token.Value<bool>();
                    else if (token.Type == JTokenType.Integer)
                        value = token.Value<int>() != 0;
                    else
                    {
                        var s = token.ToString();
                        if (bool.TryParse(s, out var b)) value = b;
                        else if (int.TryParse(s, out var iv)) value = iv != 0;
                        else value = false;
                    }
                }
                else
                {
                    value = token.ToObject(targetType);
                }

                if (field != null)
                    field.SetValue(target, value);
                else if (backingField != null)
                    backingField.SetValue(target, value);
                else
                    prop.SetValue(target, value);

                return true;
            }
            catch
            {
                return false;
            }
        }

        private static bool TrySetMemberValue(object target, string key, object value)
        {
            if (target == null || string.IsNullOrWhiteSpace(key)) return false;
            var type = target.GetType();
            var flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.IgnoreCase;

            var field = type.GetField(key, flags);
            PropertyInfo prop = null;
            FieldInfo backingField = null;
            if (field == null)
            {
                prop = type.GetProperty(key, flags);
                if (prop == null)
                {
                    var backingName = $"<{key}>k__BackingField";
                    backingField = type.GetField(backingName, flags);
                }
            }

            if (field == null && prop == null && backingField == null) return false;

            try
            {
                if (field != null)
                {
                    var targetType = field.FieldType;
                    var converted = ConvertIfNeeded(value, targetType);
                    field.SetValue(target, converted);
                }
                else if (backingField != null)
                {
                    var targetType = backingField.FieldType;
                    var converted = ConvertIfNeeded(value, targetType);
                    backingField.SetValue(target, converted);
                }
                else
                {
                    var targetType = prop.PropertyType;
                    var converted = ConvertIfNeeded(value, targetType);
                    prop.SetValue(target, converted);
                }

                return true;
            }
            catch
            {
                return false;
            }
        }

        private static object ConvertIfNeeded(object value, Type targetType)
        {
            if (value == null) return null;
            var valType = value.GetType();
            if (targetType.IsAssignableFrom(valType)) return value;
            try
            {
                if (targetType.IsEnum && value is string s)
                    return Enum.Parse(targetType, s, true);
                return Convert.ChangeType(value, Nullable.GetUnderlyingType(targetType) ?? targetType,
                    CultureInfo.InvariantCulture);
            }
            catch
            {
                return value;
            }
        }

        private static Type ResolveTypeByName(string fullName)
        {
            if (string.IsNullOrWhiteSpace(fullName)) return null;
            // Try Type.GetType first (works for assembly-qualified names)
            var t = Type.GetType(fullName, false, true);
            if (t != null) return t;

            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                try
                {
                    t = asm.GetType(fullName, false, true);
                    if (t != null) return t;
                }
                catch
                {
                }
            }

            // Fallback: search by type name (not full name)
            var shortName = fullName.Contains('.') ? fullName.Split('.').Last() : fullName;
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                try
                {
                    var found = asm.GetTypes().FirstOrDefault(x =>
                        string.Equals(x.Name, shortName, StringComparison.OrdinalIgnoreCase));
                    if (found != null) return found;
                }
                catch
                {
                }
            }

            return null;
        }
    }

    internal static class VulcanusProjectRegistry
    {
        /// <summary>
        /// Loads the VulcanusWorldCatalog for a project.json by convention:
        /// reads the project id, then loads &lt;id&gt;.project.world.asset from the same directory.
        /// Safe to call inside ScriptedImporter — no AssetDatabase.FindAssets.
        /// </summary>
        public static VulcanusWorldCatalog FindWorldCatalogForProject(string projectAssetPath)
        {
            if (string.IsNullOrWhiteSpace(projectAssetPath)) return null;

            string projectId;
            try
            {
                var dto = JsonConvert.DeserializeObject<ProjectDto>(
                    File.ReadAllText(VulcanusJsonImporter.ToAbsolutePath(projectAssetPath)));
                projectId = dto?.Id;
            }
            catch
            {
                return null;
            }

            if (string.IsNullOrWhiteSpace(projectId)) return null;

            var dir = Path.GetDirectoryName(projectAssetPath)?.Replace('\\', '/');
            var catalogAssetPath = $"{dir}/{projectId}.project.world.asset";
            return AssetDatabase.LoadAssetAtPath<VulcanusWorldCatalog>(catalogAssetPath);
        }
    }
}

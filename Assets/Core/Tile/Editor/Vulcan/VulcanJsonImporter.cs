using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using Core.Tile.Vulcan;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Core.Tile.Editor.Vulcan
{
    [ScriptedImporter(2, new[] { "project.json", "tileset.json", "map.json" }, 6100)]
    public class VulcanJsonImporter : ScriptedImporter
    {
        private const float DefaultOverlayAlpha = 0.5f;

        public override void OnImportAsset(AssetImportContext ctx)
        {
            try
            {
                if (ctx.assetPath.EndsWith("project.json", StringComparison.OrdinalIgnoreCase))
                {
                    ImportProject(ctx);
                    return;
                }

                if (ctx.assetPath.EndsWith(".tileset.json", StringComparison.OrdinalIgnoreCase))
                {
                    ImportTileset(ctx);
                    return;
                }

                if (ctx.assetPath.EndsWith(".map.json", StringComparison.OrdinalIgnoreCase))
                {
                    ImportMap(ctx);
                    return;
                }

                ImportAsText(ctx);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[VulcanJsonImporter] Failed importing '{ctx.assetPath}'.\n{ex}");
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

            var terrainDefs = dto.TerrainTypes.Select(t => new VulcanProject.TerrainDefinition
            {
                id = t.Id,
                displayName = t.DisplayName ?? t.Id,
                color = ParseHexColor(t.Color, Color.white),
                mappedTerrainType = MapTerrainIdToTerrainType(t.Id, null)
            }).ToArray();

            var layerDefs = dto.LayerDefinitions.Select(l => new VulcanProject.LayerDefinition
            {
                id = l.Id,
                name = l.Name,
                type = l.Type,
                color = ParseHexColor(l.Color, Color.white),
                zIndex = l.ZIndex
            }).ToArray();

            var entityDefs = dto.EntityTypes.Select(e => new VulcanProject.EntityTypeDefinition
            {
                id = e.Id,
                displayName = e.DisplayName,
                category = e.Category,
                group = e.Group
            }).ToArray();

            var metadataDefs = dto.TileMetadataDefinitions?.Select(d => new VulcanProject.PropertyDefinition
            {
                key = d.Key,
                label = d.Label,
                type = d.Type,
                defaultValue = d.DefaultValue?.ToString(Newtonsoft.Json.Formatting.None),
                required = d.Required
            }).ToArray() ?? Array.Empty<VulcanProject.PropertyDefinition>();

            var previousProject = AssetDatabase.LoadAssetAtPath<VulcanProject>(ctx.assetPath);
            var catalog = VulcanProjectRegistry.FindWorldCatalogForProject(ctx.assetPath);

            var warnings = new List<string>();
            var existingEntityMappings = catalog != null ? catalog.EntityPrefabMappings : previousProject?.EntityPrefabMappings;
            var entityMappings = VulcanEditorUtils.BuildEntityMappings(entityDefs, existingEntityMappings, warnings);

            var locationMappings = (catalog != null ? catalog.LocationMappings : previousProject?.LocationMappings)
                                   ?? Array.Empty<VulcanProject.MapLocationMapping>();
            var locationLinkPrefab = catalog != null
                ? catalog.LocationLinkPrefab
                : previousProject != null ? previousProject.LocationLinkPrefab : null;

            if (catalog != null)
                AddDependency(ctx, AssetDatabase.GetAssetPath(catalog));

            var project = ScriptableObject.CreateInstance<VulcanProject>();
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

            project.SetMappings(locationLinkPrefab, entityMappings, locationMappings, warnings.ToArray());

            ctx.AddObjectToAsset("project", project);
            ctx.SetMainObject(project);
        }

        // ── Tileset ───────────────────────────────────────────────────────────

        private void ImportTileset(AssetImportContext ctx)
        {
            var dto = LoadDto<TilesetDto>(ctx.assetPath);

            var projectAssetPath = FindProjectAssetPath(ctx.assetPath);
            VulcanProject project = null;
            var tileSize = 16;
            if (!string.IsNullOrEmpty(projectAssetPath))
            {
                AddDependency(ctx, projectAssetPath);
                project = AssetDatabase.LoadAssetAtPath<VulcanProject>(projectAssetPath);
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

            var tiles = new VulcanTile[tileCount];
            for (var i = 0; i < tileCount; i++)
            {
                var tile = ScriptableObject.CreateInstance<VulcanTile>();
                tile.name = $"tile_{i:D4}";

                dto.Tiles.TryGetValue(i.ToString(), out var meta);
                var terrainId = meta?.Terrain ?? GetFirstTerrainCorner(meta);
                var tags = meta?.Tags?.ToArray() ?? Array.Empty<string>();
                var collisionKind = ParseCollisionKind(meta?.Collision);
                var tileId = !string.IsNullOrEmpty(meta?.Id) ? meta.Id : $"{tilesetId}_{i}";
                Core.Tile.Vulcan.VulcanTile.VulcanTileProperty[] metaProps = null;
                if (meta?.Properties != null && meta.Properties.Count > 0)
                {
                    var list = new List<Core.Tile.Vulcan.VulcanTile.VulcanTileProperty>();
                    for (int p = 0; p < meta.Properties.Count; p++)
                    {
                        var pi = meta.Properties[p];
                        if (pi == null) continue;

                        // Attempt to apply the property directly to the VulcanTile instance
                        // if a matching field/property (case-insensitive) exists. If applied,
                        // do not store in the fallback Properties bag.
                        var applied = TryApplyPropertyToObject(tile, pi.Key, pi.Value);
                        if (applied)
                            continue;

                        // Fallback: store as JSON string in the serializable property bag.
                        var vp = new Core.Tile.Vulcan.VulcanTile.VulcanTileProperty
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

                tile.Configure(i, tileId, terrainId, MapTerrainIdToTerrainType(terrainId, project), tags, collisionKind, metaProps);
                tiles[i] = tile;
                ctx.AddObjectToAsset($"tile_{i}", tile);
            }

            var tileset = ScriptableObject.CreateInstance<VulcanTilesetAsset>();
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
            VulcanProject project = null;
            VulcanWorldCatalog catalog = null;
            var tileSize = 16;
            if (!string.IsNullOrEmpty(projectAssetPath))
            {
                AddDependency(ctx, projectAssetPath);
                project = AssetDatabase.LoadAssetAtPath<VulcanProject>(projectAssetPath);
                tileSize = project != null ? Mathf.Max(1, project.TileSize) : GetProjectTileSize(projectAssetPath);
                catalog = VulcanProjectRegistry.FindWorldCatalogForProject(projectAssetPath);
            }

            var mapId = !string.IsNullOrEmpty(dto.Id) ? dto.Id : GetBaseName(ctx.assetPath);
            var mapName = !string.IsNullOrEmpty(dto.Name) ? dto.Name : mapId;
            var width = Math.Max(1, dto.Width);
            var height = Math.Max(1, dto.Height);

            var tilesetsByIndex = new List<VulcanTilesetAsset>();
            foreach (var refId in dto.TilesetRefs)
            {
                var tilesetAssetPath = FindTilesetById(ctx.assetPath, refId, projectAssetPath);
                if (!string.IsNullOrEmpty(tilesetAssetPath))
                {
                    AddDependency(ctx, tilesetAssetPath);
                    tilesetsByIndex.Add(AssetDatabase.LoadAssetAtPath<VulcanTilesetAsset>(tilesetAssetPath));
                }
                else
                {
                    tilesetsByIndex.Add(null);
                }
            }

            var mapRoot = new GameObject(string.IsNullOrEmpty(mapName) ? mapId : mapName);
            var mapComponent = mapRoot.AddComponent<VulcanImportedMap>();

            var gridGo = new GameObject("Grid");
            gridGo.transform.SetParent(mapRoot.transform, false);
            var grid = gridGo.AddComponent<Grid>();
            grid.cellLayout = GridLayout.CellLayout.Rectangle;
            grid.cellSize = Vector3.one;

            Tilemap terrainTilemap = null;
            Tilemap farmlandTilemap = null;
            var terrainCells = new List<VulcanImportedMap.TerrainCell>();

            foreach (var layer in dto.Layers)
            {
                if (!layer.Visible) continue;

                if (layer.Data == null)
                {
                    SpawnEntities(mapRoot.transform, layer.Entities, $"{layer.Name}_Entities", height, tileSize, catalog, ctx);
                    continue;
                }

                var tilemap = CreateTilemapLayer(gridGo.transform, layer.Name, layer.ZOrder, layer.Opacity);
                PopulateTileLayer(tilemap, layer.Data, height, tilesetsByIndex);

                var isTerrain = layer.Kind.Equals("terrain", StringComparison.OrdinalIgnoreCase);
                if (terrainTilemap == null && isTerrain) terrainTilemap = tilemap;
                if (farmlandTilemap == null && layer.Name.Equals("FarmLand", StringComparison.OrdinalIgnoreCase)) farmlandTilemap = tilemap;

                if (isTerrain) ExtractTerrainCells(layer, height, terrainCells, project);

                SpawnEntities(mapRoot.transform, layer.Entities, $"{layer.Name}_Entities", height, tileSize, catalog, ctx);
            }

            SpawnEntities(mapRoot.transform, dto.Entities, "Entities", height, tileSize, catalog, ctx);
            SpawnLocationLinks(mapRoot.transform, dto.LocationLinks, height, catalog, ctx);

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
        }

        // ── Terrain / layer parsing ───────────────────────────────────────────

        private static void ExtractTerrainCells(
            LayerDto layer,
            int mapHeight,
            List<VulcanImportedMap.TerrainCell> terrainCells,
            VulcanProject project)
        {
            if (layer.TerrainData == null) return;

            var palette = layer.TerrainPalette?.ToArray() ?? Array.Empty<string>();
            for (var y = 0; y < layer.TerrainData.Count; y++)
            {
                var row = layer.TerrainData[y] as JArray;
                if (row == null) continue;

                for (var x = 0; x < row.Count; x++)
                {
                    var terrainId = ResolveTerrainId(row[x], palette);
                    if (string.IsNullOrEmpty(terrainId)) continue;

                    terrainCells.Add(new VulcanImportedMap.TerrainCell
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
            if (token == null || token.Type == JTokenType.Null) return null;
            if (token.Type == JTokenType.String) return token.Value<string>();
            if (!TryReadInt(token, out var index) || index < 0 || index >= palette.Length) return null;
            return palette[index];
        }

        // ── Tile layer population ─────────────────────────────────────────────

        private static void PopulateTileLayer(
            Tilemap tilemap,
            JToken dataToken,
            int mapHeight,
            IList<VulcanTilesetAsset> tilesetsByIndex)
        {
            if (dataToken is JArray rows)
            {
                for (var y = 0; y < rows.Count; y++)
                {
                    var row = rows[y] as JArray;
                    if (row == null) continue;

                    for (var x = 0; x < row.Count; x++)
                    {
                        var tile = TryReadInt(row[x], out var enc) ? ResolveTile(enc, tilesetsByIndex) : null;
                        if (tile != null)
                            tilemap.SetTile(new Vector3Int(x, mapHeight - 1 - y, 0), tile);
                    }
                }
                return;
            }

            if (dataToken is not JObject sparse || sparse.Value<bool?>("sparse") != true) return;

            var entries = sparse["entries"] as JArray;
            if (entries == null) return;

            foreach (var entry in entries.OfType<JObject>())
            {
                if (!TryReadInt(entry["x"], out var x) ||
                    !TryReadInt(entry["y"], out var y) ||
                    !TryReadInt(entry["v"], out var enc)) continue;

                var tile = ResolveTile(enc, tilesetsByIndex);
                if (tile != null)
                    tilemap.SetTile(new Vector3Int(x, mapHeight - 1 - y, 0), tile);
            }
        }

        private static VulcanTile ResolveTile(int encodedTile, IList<VulcanTilesetAsset> tilesetsByIndex)
        {
            if (encodedTile < 0) return null;
            var tilesetIndex = encodedTile >> 16;
            var tileIndex = encodedTile & 0xFFFF;
            if (tilesetIndex >= tilesetsByIndex.Count) return null;
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
            VulcanWorldCatalog catalog,
            AssetImportContext ctx)
        {
            if (entities == null || entities.Count == 0) return;

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
            VulcanWorldCatalog catalog,
            AssetImportContext ctx)
        {
            var px = dto.Position != null && dto.Position.Count > 0 ? dto.Position[0] : 0f;
            var py = dto.Position != null && dto.Position.Count > 1 ? dto.Position[1] : 0f;

            var entityData = new VulcanEntityInstanceData
            {
                id = !string.IsNullOrEmpty(dto.Id) ? dto.Id : Guid.NewGuid().ToString("N"),
                typeId = dto.TypeId ?? "",
                layerId = dto.LayerId ?? "",
                label = dto.Label ?? "",
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
                VulcanEntityInitializer.InitializeEntity(instance, entityData);
            }
            else
            {
                var placeholder = new GameObject($"Unmapped_{entityData.typeId}_{entityData.id}");
                placeholder.transform.SetParent(parent, false);
                placeholder.transform.localPosition = worldPos;
                placeholder.transform.localRotation = worldRot;
                Debug.LogWarning($"[VulcanImporter] No prefab mapped for entity type '{entityData.typeId}' (id: {entityData.id}). Assign it in VulcanWorldCatalog.");
            }
        }

        private static void SpawnLocationLinks(
            Transform mapRoot,
            IReadOnlyList<LocationLinkDto> links,
            int mapHeight,
            VulcanWorldCatalog catalog,
            AssetImportContext ctx)
        {
            if (links == null || links.Count == 0) return;

            var group = new GameObject("LocationLinks");
            group.transform.SetParent(mapRoot, false);

            foreach (var dto in links)
            {
                var srcX = dto.SourcePosition != null && dto.SourcePosition.Count > 0 ? dto.SourcePosition[0] : 0;
                var srcY = dto.SourcePosition != null && dto.SourcePosition.Count > 1 ? dto.SourcePosition[1] : 0;
                var szX = dto.TriggerSize != null && dto.TriggerSize.Count > 0 ? dto.TriggerSize[0] : 1;
                var szY = dto.TriggerSize != null && dto.TriggerSize.Count > 1 ? dto.TriggerSize[1] : 1;
                var tgtX = dto.TargetPosition != null && dto.TargetPosition.Count > 0 ? dto.TargetPosition[0] : 0;
                var tgtY = dto.TargetPosition != null && dto.TargetPosition.Count > 1 ? dto.TargetPosition[1] : 0;

                var data = new VulcanLocationLinkData
                {
                    id = !string.IsNullOrEmpty(dto.Id) ? dto.Id : Guid.NewGuid().ToString("N"),
                    label = dto.Label ?? "",
                    sourcePosition = new Vector2Int(srcX, srcY),
                    triggerSize = new Vector2Int(szX, szY),
                    targetMapId = dto.TargetMapId ?? "",
                    targetPosition = new Vector2Int(tgtX, tgtY),
                    targetLinkId = dto.TargetLinkId ?? "",
                    direction = dto.Direction ?? ""
                };

                var cellY = mapHeight - 1 - data.sourcePosition.y;
                var worldPos = new Vector3(data.sourcePosition.x + 0.5f, cellY + 0.5f, 0f);

                GameObject linkPrefab = null;
                catalog?.TryGetLocationLinkPrefab(out linkPrefab);

                if (linkPrefab != null)
                {
                    AddDependency(ctx, AssetDatabase.GetAssetPath(linkPrefab));
                    var instance = (GameObject)PrefabUtility.InstantiatePrefab(linkPrefab, group.transform);
                    instance.name = $"{linkPrefab.name}_{data.id}";
                    instance.transform.localPosition = worldPos;
                    EnsureTriggerCollider(instance, data.triggerSize);
                    VulcanEntityInitializer.InitializeLocationLink(instance, data, catalog);
                }
                else
                {
                    var placeholder = new GameObject($"Link_{data.id}");
                    placeholder.transform.SetParent(group.transform, false);
                    placeholder.transform.localPosition = worldPos;
                    EnsureTriggerCollider(placeholder, data.triggerSize);
                    Debug.LogWarning($"[VulcanImporter] No locationLinkPrefab assigned in VulcanWorldCatalog. Link '{data.id}' placed as trigger-only.");
                }
            }
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

        private static void EnsureTriggerCollider(GameObject go, Vector2Int triggerSize)
        {
            var box = go.GetComponent<BoxCollider2D>() ?? go.AddComponent<BoxCollider2D>();
            box.isTrigger = true;
            box.size = new Vector2(Mathf.Max(1, triggerSize.x), Mathf.Max(1, triggerSize.y));
        }

        // ── Sprite creation ───────────────────────────────────────────────────

        private static Sprite CreateSpriteForTile(Texture2D texture, int columns, int tileSize, int tileIndex)
        {
            if (texture == null || tileSize <= 0 || columns <= 0) return null;

            var x = (tileIndex % columns) * tileSize;
            var y = texture.height - ((tileIndex / columns + 1) * tileSize);
            if (x < 0 || y < 0 || x + tileSize > texture.width || y + tileSize > texture.height) return null;

            return Sprite.Create(texture, new Rect(x, y, tileSize, tileSize), new Vector2(0.5f, 0.5f), tileSize, 0, SpriteMeshType.FullRect);
        }

        // ── Tile meta helpers ─────────────────────────────────────────────────

        private static string GetFirstTerrainCorner(TileMetaDto meta)
        {
            if (meta?.TerrainCorners == null) return null;
            return meta.TerrainCorners.FirstOrDefault(c => !string.IsNullOrEmpty(c));
        }

        private static VulcanCollisionKind ParseCollisionKind(CollisionDto collision)
        {
            if (collision == null) return VulcanCollisionKind.None;
            if (collision.Type.Equals("full", StringComparison.OrdinalIgnoreCase)) return VulcanCollisionKind.Full;
            if (collision.Type.Equals("complex", StringComparison.OrdinalIgnoreCase)) return VulcanCollisionKind.Complex;
            return VulcanCollisionKind.None;
        }

        private static TerrainType MapTerrainIdToTerrainType(string terrainId, VulcanProject project)
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
            if (token.Type == JTokenType.Integer) { value = token.Value<int>(); return true; }
            if (token.Type == JTokenType.Float) { value = Mathf.RoundToInt(token.Value<float>()); return true; }
            if (token.Type != JTokenType.String) return false;
            return int.TryParse(token.Value<string>(), NumberStyles.Integer, CultureInfo.InvariantCulture, out value);
        }

        // ── Path utilities ────────────────────────────────────────────────────

        private static T LoadDto<T>(string assetPath) =>
            JsonConvert.DeserializeObject<T>(File.ReadAllText(ToAbsolutePath(assetPath)));

        private static string GetBaseName(string assetPath)
        {
            var fileName = Path.GetFileName(assetPath);
            if (fileName.EndsWith(".map.json", StringComparison.OrdinalIgnoreCase)) return fileName[..^".map.json".Length];
            if (fileName.EndsWith(".tileset.json", StringComparison.OrdinalIgnoreCase)) return fileName[..^".tileset.json".Length];
            if (fileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase)) return fileName[..^".json".Length];
            return Path.GetFileNameWithoutExtension(fileName);
        }

        private static string FindProjectAssetPath(string assetPath)
        {
            var directory = Path.GetDirectoryName(ToAbsolutePath(assetPath));
            while (!string.IsNullOrEmpty(directory))
            {
                var canonical = Path.Combine(directory, "project.json");
                if (File.Exists(canonical) && TryAbsoluteToAssetPath(canonical, out var canonicalPath))
                    return canonicalPath;

                var generic = Directory
                    .GetFiles(directory, "*.project.json", SearchOption.TopDirectoryOnly)
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
                Debug.LogWarning($"[VulcanJsonImporter] Could not read tileSize from '{projectAssetPath}': {ex.Message}");
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

            var canonical = Path.Combine(projectRoot, "tilesets", $"{tilesetId}.tileset.json");
            if (File.Exists(canonical) && TryAbsoluteToAssetPath(canonical, out var canonicalAssetPath))
                return canonicalAssetPath;

            foreach (var filePath in Directory.GetFiles(projectRoot, "*.tileset.json", SearchOption.AllDirectories).OrderBy(p => p))
            {
                try
                {
                    var dto = LoadDto<TilesetDto>(filePath);
                    if (!string.Equals(dto.Id, tilesetId, StringComparison.OrdinalIgnoreCase)) continue;
                    if (TryAbsoluteToAssetPath(filePath, out var path)) return path;
                }
                catch { /* ignore malformed tileset candidates */ }
            }
            return null;
        }

        private static string ResolveAssetReferencePath(string ownerAssetPath, string relativePath, string projectAssetPath)
        {
            if (string.IsNullOrWhiteSpace(relativePath)) return null;
            if (TryResolveRelative(ownerAssetPath, relativePath, out var byOwner)) return byOwner;
            if (!string.IsNullOrEmpty(projectAssetPath) && TryResolveRelative(projectAssetPath, relativePath, out var byProject)) return byProject;

            if (!string.IsNullOrEmpty(projectAssetPath))
            {
                var projectRoot = Path.GetDirectoryName(ToAbsolutePath(projectAssetPath));
                var targetFileName = Path.GetFileName(relativePath);
                if (!string.IsNullOrWhiteSpace(projectRoot) && !string.IsNullOrWhiteSpace(targetFileName) && Directory.Exists(projectRoot))
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
            var prop = field == null ? type.GetProperty(key, flags) : null;
            if (field == null && prop == null) return false;

            Type targetType = field != null ? field.FieldType : prop.PropertyType;

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
                else
                    prop.SetValue(target, value);

                return true;
            }
            catch
            {
                return false;
            }
        }
    }

    internal static class VulcanProjectRegistry
    {
        /// <summary>
        /// Loads the VulcanWorldCatalog for a project.json by convention:
        /// reads the project id, then loads &lt;id&gt;.project.world.asset from the same directory.
        /// Safe to call inside ScriptedImporter — no AssetDatabase.FindAssets.
        /// </summary>
        public static VulcanWorldCatalog FindWorldCatalogForProject(string projectAssetPath)
        {
            if (string.IsNullOrWhiteSpace(projectAssetPath)) return null;

            string projectId;
            try
            {
                var dto = JsonConvert.DeserializeObject<ProjectDto>(
                    File.ReadAllText(VulcanJsonImporter.ToAbsolutePath(projectAssetPath)));
                projectId = dto?.Id;
            }
            catch { return null; }

            if (string.IsNullOrWhiteSpace(projectId)) return null;

            var dir = Path.GetDirectoryName(projectAssetPath)?.Replace('\\', '/');
            var catalogAssetPath = $"{dir}/{projectId}.project.world.asset";
            return AssetDatabase.LoadAssetAtPath<VulcanWorldCatalog>(catalogAssetPath);
        }
    }
}

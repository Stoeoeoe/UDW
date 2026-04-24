using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Location;
using Core.Tile.Vulcanus;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Tilemaps;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class MapImporter
    {
        private const float DefaultOverlayAlpha = 0.5f;

        public static void ImportMap(AssetImportContext ctx)
        {
            var dto = VulcanusImportHelpers.LoadDto<MapDto>(ctx.assetPath);

            var projectAssetPath = VulcanusImportHelpers.FindProjectAssetPath(ctx.assetPath);
            VulcanusProject project = null;
            VulcanusWorldCatalog catalog = null;
            var tileSize = 16;
            if (!string.IsNullOrEmpty(projectAssetPath))
            {
                VulcanusImportHelpers.AddDependency(ctx, projectAssetPath);
                project = AssetDatabase.LoadAssetAtPath<VulcanusProject>(projectAssetPath);
                tileSize = project != null
                    ? Mathf.Max(1, project.TileSize)
                    : VulcanusImportHelpers.GetProjectTileSize(projectAssetPath);
                catalog = VulcanusProjectRegistry.FindWorldCatalogForProject(projectAssetPath);
            }

            var mapId = !string.IsNullOrEmpty(dto.Id) ? dto.Id : VulcanusImportHelpers.GetBaseName(ctx.assetPath);
            var mapName = !string.IsNullOrEmpty(dto.Name) ? dto.Name : mapId;
            var width = Math.Max(1, dto.Width);
            var height = Math.Max(1, dto.Height);

            var tilesetsByIndex = new List<VulcanusTilesetAsset>();
            foreach (var refId in dto.TilesetRefs)
            {
                var tilesetAssetPath =
                    VulcanusImportHelpers.FindTilesetById(ctx.assetPath, refId, projectAssetPath);
                if (!string.IsNullOrEmpty(tilesetAssetPath))
                {
                    VulcanusImportHelpers.AddDependency(ctx, tilesetAssetPath);
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

                if (string.Equals(layer.Kind, "object", StringComparison.OrdinalIgnoreCase))
                {
                        SpawnObjectLayer(mapRoot.transform, layer, height, tileSize, tilesetsByIndex);
                    continue;
                }

                if (layer.Data == null)
                {
                    SpawnEntities(mapRoot.transform, layer.Entities, $"{layer.Name}_Entities", height, tileSize,
                        catalog, ctx);
                    continue;
                }

                var tilemap = CreateTilemapLayer(gridGo.transform, layer.Name, layer.ZOrder, layer.Opacity, layer.SortingLayer);
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
            var irrigatedTilemap =
                CreateTilemapLayer(gridGo.transform, "FarmLand_Irrigated", 11, DefaultOverlayAlpha);
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

        // ── Location data ─────────────────────────────────────────────────────

        private static LocationData BuildLocationData(string mapId, string mapName, MapMetadataDto metadata)
        {
            var locationData = ScriptableObject.CreateInstance<LocationData>();
            locationData.name = "LocationData_" + mapId;
            locationData.id = mapId;
            locationData.label = mapName;

            if (metadata?.Extra != null)
            {
                foreach (var (key, token) in metadata.Extra)
                    VulcanusImportHelpers.TryApplyPropertyToObject(locationData, key, token);
            }

            return locationData;
        }

        // ── Terrain extraction ────────────────────────────────────────────────

        private static void ExtractTerrainCells(
            LayerDto layer,
            int mapHeight,
            List<VulcanusImportedMap.TerrainCell> terrainCells,
            VulcanusProject project)
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

                    terrainCells.Add(new VulcanusImportedMap.TerrainCell
                    {
                        x = x,
                        y = mapHeight - 1 - y,
                        terrainId = terrainId,
                        terrainType = VulcanusImportHelpers.MapTerrainIdToTerrainType(terrainId, project)
                    });
                }
            }
        }

        private static string ResolveTerrainId(JToken token, string[] palette)
        {
            if (token == null || token.Type == JTokenType.Null) return null;
            if (token.Type == JTokenType.String) return token.Value<string>();
            if (!VulcanusImportHelpers.TryReadInt(token, out var index) || index < 0 || index >= palette.Length)
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
                    if (row == null) continue;

                    for (var x = 0; x < row.Count; x++)
                    {
                        if (!VulcanusImportHelpers.TryReadInt(row[x], out var encodedTile)) continue;
                        var tile = ResolveTile(encodedTile, tilesetsByIndex);
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
                if (!VulcanusImportHelpers.TryReadInt(entry["x"], out var x) ||
                    !VulcanusImportHelpers.TryReadInt(entry["y"], out var y) ||
                    !VulcanusImportHelpers.TryReadInt(entry["v"], out var encodedTile))
                    continue;

                var tile = ResolveTile(encodedTile, tilesetsByIndex);
                if (tile != null)
                    tilemap.SetTile(new Vector3Int(x, mapHeight - 1 - y, 0), tile);
            }
        }

        private static VulcanusTile ResolveTile(int encodedTile, IList<VulcanusTilesetAsset> tilesetsByIndex)
        {
            if (encodedTile < 0) return null;
            var tilesetIndex = encodedTile >> 16;
            var tileIndex = encodedTile & 0xFFFF;
            if (tilesetIndex >= tilesetsByIndex.Count) return null;
            var tileset = tilesetsByIndex[tilesetIndex];
            return tileset != null && tileset.TryGetTile(tileIndex, out var tile) ? tile : null;
        }

        // ── Entity spawning ───────────────────────────────────────────────────

        private static void SpawnEntities(
            Transform mapRoot,
            IReadOnlyList<EntityInstanceDto> entities,
            string groupName,
            int mapHeight,
            int tileSize,
            VulcanusWorldCatalog catalog,
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
                propertiesJson = Newtonsoft.Json.JsonConvert.SerializeObject(dto.Properties ?? new JObject())
            };

            var ts = Mathf.Max(1, tileSize);
            var worldPos = new Vector3(px / ts, (mapHeight * ts - py) / ts, 0f);
            var worldRot = Quaternion.Euler(0f, 0f, -entityData.rotationDegrees);

            GameObject prefab = null;
            catalog?.TryGetEntityPrefab(entityData.typeId, out prefab);

            if (prefab != null)
            {
                // Ensure the prefab itself is declared as a dependency so Unity doesn't strip
                // references when the instantiated object is embedded into the imported asset.
                VulcanusImportHelpers.AddDependency(ctx, AssetDatabase.GetAssetPath(prefab));
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

        // ── Objects layer → baked sprite GameObjects ─────────────────────────

        private static void SpawnObjectLayer(
            Transform mapRoot,
            LayerDto layer,
            int mapHeight,
            int tileSize,
            IList<VulcanusTilesetAsset> tilesetsByIndex)
        {
            if (layer.ObjectInstances == null || layer.ObjectInstances.Count == 0) return;

            var group = new GameObject(layer.Name);
            group.transform.SetParent(mapRoot, false);

            var tilesetById = new Dictionary<string, VulcanusTilesetAsset>();
            foreach (var ts in tilesetsByIndex)
            {
                if (ts != null && !tilesetById.ContainsKey(ts.TilesetId))
                    tilesetById[ts.TilesetId] = ts;
            }

            foreach (var inst in layer.ObjectInstances)
            {
                if (!tilesetById.TryGetValue(inst.TilesetId, out var tileset)) continue;
                if (!tileset.TryGetObjectDefinition(inst.ObjectDefinitionId, out var def)) continue;

                var objHeightTiles = def.heightTiles > 0 ? def.heightTiles
                    : (def.tiles?.Length > 0 ? def.tiles.Max(t => t.y) - def.tiles.Min(t => t.y) + 1 : 1);
                var objWidthTiles = def.widthTiles > 0 ? def.widthTiles
                    : (def.tiles?.Length > 0 ? def.tiles.Max(t => t.x) - def.tiles.Min(t => t.x) + 1 : 1);

                // inst.X/Y are top-left pixel coords in map space (Y down).
                // Object origin is bottom-center (sprite pivot).
                var worldX = inst.X / (float)tileSize + objWidthTiles * 0.5f;
                var worldY = mapHeight - inst.Y / (float)tileSize - objHeightTiles;
                var worldPos = new Vector3(worldX, worldY, 0f);

                if (def.prefab != null)
                {
                    // Prefab was built by TilesetImporter with correct SpriteRenderer + collider.
                    var go = GameObject.Instantiate(def.prefab);
                    go.name = $"{def.id}_{inst.Id}";
                    go.transform.SetParent(group.transform, false);
                    go.transform.localPosition = worldPos;

                    // Patch the sorting order to match the layer.
                    var sr = go.GetComponent<SpriteRenderer>();
                    if (sr != null) sr.sortingOrder = layer.ZOrder;
                    var sg = go.GetComponent<SortingGroup>();
                    if (sg != null) sg.sortingOrder = layer.ZOrder;
                }
                else if (def.sprite != null)
                {
                    // Prefab was not generated (e.g. no Unity renderer available) — fallback sprite GO.
                    var go = new GameObject($"{def.id}_{inst.Id}");
                    go.transform.SetParent(group.transform, false);
                    go.transform.localPosition = worldPos;

                    var sr = go.AddComponent<SpriteRenderer>();
                    sr.sprite = def.sprite;
                    sr.sortingLayerName = "Objects";
                    sr.sortingOrder = layer.ZOrder;
                    sr.spriteSortPoint = SpriteSortPoint.Pivot;

                    var sg = go.AddComponent<SortingGroup>();
                    sg.sortingLayerName = "Objects";

                    var ySort = go.AddComponent<YSortByPosition>();
                    ySort.Offset = -16;
                }
            }
        }

        // ── Tilemap helpers ───────────────────────────────────────────────────

        private static Tilemap CreateTilemapLayer(Transform parent, string layerName, int sortingOrder, float opacity, string sortingLayerHint = null)
        {
            var go = new GameObject(layerName);
            go.transform.SetParent(parent, false);

            var tilemap = go.AddComponent<Tilemap>();
            tilemap.color = new Color(1f, 1f, 1f, Mathf.Clamp01(opacity));

            var renderer = go.AddComponent<TilemapRenderer>();
            // "Objects" layers use Y-sort so multi-tile sprites (trees etc.) render behind the player correctly.
            // pivotY on each sprite anchors the sort point at the ground contact, regardless of tile height.
            var isYSorted = string.Equals(sortingLayerHint, "Objects", StringComparison.OrdinalIgnoreCase);
            renderer.sortOrder = isYSorted ? TilemapRenderer.SortOrder.BottomLeft : TilemapRenderer.SortOrder.TopLeft;
            renderer.sortingOrder = sortingOrder;

            return tilemap;
        }
    }
}

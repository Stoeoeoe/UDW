using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Location;
using Core.Spawning;
using Core.Spawning.Editor;
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

        public static void ImportMap(AssetImportContext ctx, int shorelineDistancePixels = 32)
        {
            var dto = VulcanusImportHelpers.LoadDto<MapDto>(ctx.assetPath);
            VulcanusImportHelpers.AddDependency(ctx, SpawnableCatalogEditor.CatalogPath);
            var spawnCatalog = AssetDatabase.LoadAssetAtPath<SpawnableCatalog>(SpawnableCatalogEditor.CatalogPath);

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
                if (catalog) VulcanusImportHelpers.AddDependency(ctx, AssetDatabase.GetAssetPath(catalog));
            }

            var mapId = !string.IsNullOrEmpty(dto.Id) ? dto.Id : VulcanusImportHelpers.GetBaseName(ctx.assetPath);
            var mapName = !string.IsNullOrEmpty(dto.Name) ? dto.Name : mapId;
            var width = Math.Max(1, dto.Width);
            var height = Math.Max(1, dto.Height);

            var tilesetPaths = VulcanusImportHelpers.BuildTilesetIndex(ctx.assetPath, projectAssetPath);
            var tilesetsByIndex = new List<VulcanusTilesetAsset>();
            foreach (var refId in dto.TilesetRefs)
            {
                if (string.IsNullOrWhiteSpace(refId) || !tilesetPaths.TryGetValue(refId, out var tilesetAssetPath))
                    throw new InvalidOperationException($"Map '{mapId}' references missing tileset '{refId}'.");
                VulcanusImportHelpers.AddDependency(ctx, tilesetAssetPath);
                var tileset = AssetDatabase.LoadAssetAtPath<VulcanusTilesetAsset>(tilesetAssetPath);
                if (!tileset)
                    throw new InvalidOperationException($"Tileset '{refId}' at '{tilesetAssetPath}' has not imported successfully.");
                tilesetsByIndex.Add(tileset);
            }

            var mapRoot = new GameObject(string.IsNullOrEmpty(mapName) ? mapId : mapName);
            try
            {
                var mapComponent = mapRoot.AddComponent<VulcanusImportedMap>();

                var gridGo = new GameObject("Grid");
                gridGo.transform.SetParent(mapRoot.transform, false);
                var grid = gridGo.AddComponent<Grid>();
                grid.cellLayout = GridLayout.CellLayout.Rectangle;
                grid.cellSize = Vector3.one;

                Tilemap terrainTilemap = null;
                Tilemap farmlandTilemap = null;
                var terrainCells = new List<VulcanusImportedMap.TerrainCell>();
                var persistentEntities = new List<AuthoredSpawnPlacement>();
                var waterSources = new List<Tilemap>();

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
                            catalog, spawnCatalog, ctx, persistentEntities);
                        continue;
                    }

                    var hasTileCollision = layer.Kind.Equals("visual", StringComparison.OrdinalIgnoreCase) ||
                                           layer.Kind.Equals("terrain", StringComparison.OrdinalIgnoreCase);
                    var tilemap = CreateTilemapLayer(
                        gridGo.transform,
                        layer.Name,
                        layer.ZOrder,
                        layer.Opacity,
                        layer.SortingLayer,
                        hasTileCollision);
                    PopulateTileLayer(tilemap, layer.Data, height, tilesetsByIndex);
                    waterSources.Add(tilemap);

                    var isTerrain = layer.Kind.Equals("terrain", StringComparison.OrdinalIgnoreCase);
                    if (terrainTilemap == null && isTerrain) terrainTilemap = tilemap;
                    if (farmlandTilemap == null && layer.Name.Equals("FarmLand", StringComparison.OrdinalIgnoreCase))
                        farmlandTilemap = tilemap;

                    if (isTerrain) ExtractTerrainCells(layer, height, terrainCells, project);

                    SpawnEntities(mapRoot.transform, layer.Entities, $"{layer.Name}_Entities", height, tileSize, catalog, spawnCatalog,
                        ctx, persistentEntities);
                }

                WaterTilemapImporter.ImportAll(ctx, waterSources, tileSize, width, height, shorelineDistancePixels);
                SpawnEntities(mapRoot.transform, dto.Entities, "Entities", height, tileSize, catalog, spawnCatalog, ctx, persistentEntities);

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
                VulcanusMapTriggerImporter.SpawnColliders(
                    mapRoot.transform,
                    dto.SpatialPrimitives?.Collisions,
                    height,
                    tileSize);

                var plowedTilemap = CreateTilemapLayer(gridGo.transform, "FarmLand_Plowed", 10, DefaultOverlayAlpha);
                var irrigatedTilemap =
                    CreateTilemapLayer(gridGo.transform, "FarmLand_Irrigated", 11, DefaultOverlayAlpha);
                var overlayTilemap = CreateTilemapLayer(gridGo.transform, "Overlay", 999, DefaultOverlayAlpha);

                if (terrainTilemap == null)
                    terrainTilemap = CreateTilemapLayer(gridGo.transform, "Terrain", 0, 1f);

                mapComponent.Configure(mapId, mapName, width, height, tileSize);
                mapComponent.SetTilemaps(terrainTilemap, farmlandTilemap, plowedTilemap, irrigatedTilemap, overlayTilemap);
                mapComponent.SetTerrainCells(terrainCells.ToArray());
                mapComponent.SetPersistentEntities(persistentEntities.ToArray());

                ctx.AddObjectToAsset("map", mapRoot);
                ctx.SetMainObject(mapRoot);

                ctx.AddObjectToAsset("locationData", BuildLocationData(mapId, mapName, dto.Metadata, ctx.assetPath));
            }
            catch
            {
                UnityEngine.Object.DestroyImmediate(mapRoot);
                throw;
            }
        }

        // ── Location data ─────────────────────────────────────────────────────

        private static LocationData BuildLocationData(string mapId, string mapName, MapMetadataDto metadata, string mapAssetPath)
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

            // Source metadata can configure gameplay, but identity and scene routing are importer-owned.
            locationData.id = mapId;
            locationData.scenePath = VulcanusMapScenePostprocessor.GetScenePath(mapAssetPath);
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
            SpawnableCatalog spawnCatalog,
            AssetImportContext ctx,
            List<AuthoredSpawnPlacement> persistentEntities)
        {
            if (entities == null || entities.Count == 0) return;

            var group = new GameObject(groupName);
            group.transform.SetParent(mapRoot, false);

            foreach (var dto in entities)
                SpawnEntityInstance(group.transform, dto, mapHeight, tileSize, catalog, spawnCatalog, ctx, persistentEntities);
        }

        private static void SpawnEntityInstance(
            Transform parent,
            EntityInstanceDto dto,
            int mapHeight,
            int tileSize,
            VulcanusWorldCatalog catalog,
            SpawnableCatalog spawnCatalog,
            AssetImportContext ctx,
            List<AuthoredSpawnPlacement> persistentEntities)
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

            // Persistent type IDs resolve from the same catalog used after a restart.
            var spawnable = spawnCatalog?.Prefabs.FirstOrDefault(p => p && p.PrefabId == entityData.typeId);
            GameObject prefab = spawnable ? spawnable.gameObject : null;
            if (!prefab) catalog?.TryGetEntityPrefab(entityData.typeId, out prefab);

            if (prefab != null)
            {
                var persistent = prefab.GetComponent<SpawnedObject>();
                if (persistent && (spawnCatalog == null || !spawnCatalog.Prefabs.Contains(persistent)))
                    throw new InvalidOperationException($"Persistent entity prefab '{prefab.name}' must be registered in SpawnableCatalog.");
                if (persistent && !prefab.activeSelf)
                    throw new InvalidOperationException($"Persistent entity prefab '{prefab.name}' needs an active root; its template parent supplies inactivity.");
                if (persistent && string.IsNullOrWhiteSpace(dto.Id))
                    throw new InvalidOperationException($"Persistent entity '{dto.TypeId}' needs an authored instance ID; random import IDs cannot be saved reliably.");
                if (persistent && persistentEntities.Any(p => p.id == dto.Id))
                    throw new InvalidOperationException($"Duplicate persistent entity ID '{dto.Id}' in this map.");
                var targetParent = parent;
                if (persistent)
                {
                    var templates = parent.Find("Persistent Templates");
                    if (!templates)
                    {
                        var holder = new GameObject("Persistent Templates");
                        holder.SetActive(false);
                        holder.transform.SetParent(parent, false);
                        templates = holder.transform;
                    }
                    targetParent = templates;
                }
                // Ensure the prefab itself is declared as a dependency so Unity doesn't strip
                // references when the instantiated object is embedded into the imported asset.
                VulcanusImportHelpers.AddDependency(ctx, AssetDatabase.GetAssetPath(prefab));
                var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab, targetParent);
                instance.name = $"{prefab.name}_{entityData.id}";
                instance.transform.localPosition = worldPos;
                instance.transform.localRotation = worldRot;
                VulcanusEntityInitializer.InitializeEntity(instance, entityData);
                if (persistent)
                {
                    // JSON properties configure gameplay fields, never the shared prefab identity.
                    var serialized = new SerializedObject(instance.GetComponent<SpawnedObject>());
                    serialized.FindProperty("prefabId").stringValue = persistent.PrefabId;
                    serialized.ApplyModifiedPropertiesWithoutUndo();
                    persistentEntities.Add(new AuthoredSpawnPlacement { id = dto.Id, template = instance.GetComponent<SpawnedObject>() });
                }
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

            var tilesetById = Core.Catalogs.IdIndex.FirstWins(tilesetsByIndex,
                tileset => tileset ? tileset.TilesetId : null, StringComparer.OrdinalIgnoreCase);
            foreach (var inst in layer.ObjectInstances)
            {
                if (string.IsNullOrWhiteSpace(inst.TilesetId) || !tilesetById.TryGetValue(inst.TilesetId, out var tileset))
                    throw new InvalidOperationException($"Object '{inst.Id}' references missing tileset '{inst.TilesetId}'.");
                if (!tileset.TryGetObjectDefinition(inst.ObjectDefinitionId, out var def) || !def.prefab)
                    throw new InvalidOperationException($"Object '{inst.Id}' requires imported prefab '{inst.ObjectDefinitionId}' from tileset '{inst.TilesetId}'. Reimport the tileset.");

                var instance = UnityEngine.Object.Instantiate(def.prefab, group.transform);
                instance.name = $"{def.id}_{inst.Id}";
                instance.transform.localPosition = new Vector3(
                    inst.X / (float)tileSize + def.widthTiles * 0.5f,
                    mapHeight - inst.Y / (float)tileSize - def.heightTiles, 0f);
                ApplyObjectSorting(instance, layer.ZOrder);
            }
        }

        private static void ApplyObjectSorting(GameObject go, int sortingOrder)
        {
            foreach (var renderer in go.GetComponentsInChildren<SpriteRenderer>(true))
            {
                renderer.sortingLayerName = "Objects";
                renderer.sortingOrder = sortingOrder;
                renderer.spriteSortPoint = SpriteSortPoint.Pivot;
            }

            foreach (var sortingGroup in go.GetComponentsInChildren<SortingGroup>(true))
            {
                sortingGroup.sortingLayerName = "Objects";
                sortingGroup.sortingOrder = sortingOrder;
            }
        }

        private static Tilemap CreateTilemapLayer(Transform parent, string layerName, int sortingOrder, float opacity, string sortingLayerHint = null, bool addCollider = false)
        {
            var go = new GameObject(layerName);
            go.transform.SetParent(parent, false);

            var tilemap = go.AddComponent<Tilemap>();
            tilemap.color = new Color(1f, 1f, 1f, Mathf.Clamp01(opacity));

            var renderer = go.AddComponent<TilemapRenderer>();
            var isYSorted = string.Equals(sortingLayerHint, "Objects", StringComparison.OrdinalIgnoreCase);
            renderer.sortOrder = isYSorted ? TilemapRenderer.SortOrder.BottomLeft : TilemapRenderer.SortOrder.TopLeft;
            renderer.sortingOrder = sortingOrder;

            if (addCollider)
            {
                var tilemapCollider = go.AddComponent<TilemapCollider2D>();
                // No clue why, but we have to offset by 0.5y
                tilemapCollider.offset = new Vector2(0f, -0.5f);
            }

            return tilemap;
        }
    }
}

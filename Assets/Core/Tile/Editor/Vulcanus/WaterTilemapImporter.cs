using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Core.Tile.Vulcanus;
using Core.Tile.Water;
using Core.Tile.Water.Editor;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;
using UnityEngine.Tilemaps;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class WaterTilemapImporter
    {
        internal const string ProfileFolder = "Assets/Content/Water";
        internal const string ColorKeysPath = ProfileFolder + "/WaterColorKeys.asset";
        private static readonly Vector3Int[] Neighbours =
            { Vector3Int.left, Vector3Int.right, Vector3Int.up, Vector3Int.down };

        internal static WaterProfile LoadProfile(string type, AssetImportContext context)
        {
            if (string.IsNullOrWhiteSpace(type) || type.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || type == "." || type == "..")
                throw new FormatException($"Invalid waterType '{type}': expected a profile asset name.");
            var path = $"{ProfileFolder}/{type}.asset";
            context.DependsOnSourceAsset(path);
            var profile = AssetDatabase.LoadAssetAtPath<WaterProfile>(path);
            if (!profile)
                throw new InvalidOperationException($"waterType '{type}' requires a WaterProfile at '{path}'.");
            if (profile.flowMap) context.DependsOnArtifact(AssetDatabase.GetAssetPath(profile.flowMap));
            profile.Validate();
            return profile;
        }

        /// <summary>Optional. Without the asset no tileset is keyed and only waterType metadata creates water.</summary>
        private static WaterColorKeys LoadColorKeys(AssetImportContext context)
        {
            // Depending on the path also reimports maps when the asset is created later.
            context.DependsOnSourceAsset(ColorKeysPath);
            var keys = AssetDatabase.LoadAssetAtPath<WaterColorKeys>(ColorKeysPath);
            if (keys) keys.Validate();
            return keys;
        }

        private static readonly Dictionary<string, Vector2> Compass = new(StringComparer.Ordinal)
        {
            ["north"] = new Vector2(0, 1), ["northeast"] = new Vector2(1, 1).normalized, ["east"] = new Vector2(1, 0),
            ["southeast"] = new Vector2(1, -1).normalized, ["south"] = new Vector2(0, -1), ["southwest"] = new Vector2(-1, -1).normalized,
            ["west"] = new Vector2(-1, 0), ["northwest"] = new Vector2(-1, 1).normalized
        };

        /// <summary>Location metadata `swellDirection`: where the swell travels, or zero (empty or "default") for each profile's own.</summary>
        internal static Vector2 ParseSwellDirection(string value)
        {
            if (string.IsNullOrEmpty(value) || value == "default") return Vector2.zero;
            if (!Compass.TryGetValue(value, out var direction))
                throw new FormatException($"Location metadata 'swellDirection' must be default or a compass direction (north, northeast, ... northwest), not '{value}'.");
            return direction;
        }

        internal static void ImportAll(AssetImportContext context, IReadOnlyList<Tilemap> sources, int pixelsPerUnit,
            int mapWidth, int mapHeight, int maximumDistance,
            IReadOnlyDictionary<Tilemap, List<DrawnWaterBody>> drawnWater, Vector2 swellDirection)
        {
            // Split keyed tiles first, so the shoreline builder and every later step see final sprites.
            var keyedWater = PrepareKeyedTiles(context, sources, LoadColorKeys(context));
            // Vulcanus sprites use a top-centre pivot and the tilemap's half-cell anchor.
            var mapPixels = new RectInt(0, -pixelsPerUnit / 2, mapWidth * pixelsPerUnit, mapHeight * pixelsPerUnit);
            // Every water source shares one occupancy, so touching bodies never form a false coastline.
            var keyedMasks = keyedWater.SelectMany(layer => layer.Value.Values.SelectMany(cells =>
                cells.Select(cell => (layer.Key, cell.Key, cell.Value))));
            var drawnMasks = drawnWater.SelectMany(layer => layer.Value.SelectMany(body =>
                body.Cells.Select(cell => (layer.Key, cell.Key, cell.Value))));
            var shorelines = new WaterShorelineBuilder(sources, keyedMasks.Concat(drawnMasks), pixelsPerUnit, mapPixels, maximumDistance);
            foreach (var source in sources)
            {
                var drawn = drawnWater.TryGetValue(source, out var bodies) ? bodies : new List<DrawnWaterBody>();
                Import(context, source, pixelsPerUnit, shorelines, keyedWater[source], drawn, swellDirection);
            }
        }

        /// <summary>
        /// Replaces tiles from keyed tilesets with clones showing only their terrain pixels and returns,
        /// per source layer, the water mask sprite of every keyed cell by water type.
        /// </summary>
        private static Dictionary<Tilemap, Dictionary<string, Dictionary<Vector3Int, Sprite>>> PrepareKeyedTiles(
            AssetImportContext context, IReadOnlyList<Tilemap> sources, WaterColorKeys keys)
        {
            var result = new Dictionary<Tilemap, Dictionary<string, Dictionary<Vector3Int, Sprite>>>();
            var keyedTextures = keys ? new HashSet<Texture2D>(keys.KeyedTilesets) : new HashSet<Texture2D>();
            var tilesets = new Dictionary<Texture2D, WaterKeyedTileset>();
            var clones = new Dictionary<VulcanusTile, VulcanusTile>();
            foreach (var source in sources)
            {
                var water = new Dictionary<string, Dictionary<Vector3Int, Sprite>>(StringComparer.Ordinal);
                result.Add(source, water);
                if (keyedTextures.Count == 0) continue;
                foreach (var cell in source.cellBounds.allPositionsWithin)
                {
                    if (source.GetTile(cell) is not VulcanusTile tile || !tile.sprite) continue;
                    var texture = tile.sprite.texture;
                    if (!keyedTextures.Contains(texture)) continue;
                    if (!tilesets.TryGetValue(texture, out var tileset))
                        tilesets.Add(texture, tileset = WaterKeyedTileset.Create(context, texture, keys));
                    var types = tileset.TypesIn(tile.sprite);
                    if (types.Count == 0) continue; // Plain land tile from a keyed tileset.
                    if (tile.WaterType != "None")
                        throw new InvalidOperationException($"Tile '{tile.TileId}' has water key pixels and also has waterType '{tile.WaterType}'. Use one or the other.");

                    foreach (var type in types)
                    {
                        tileset.TryGetMaskSprite(tile.sprite, type, out var mask);
                        if (!water.TryGetValue(type, out var cells))
                            water.Add(type, cells = new Dictionary<Vector3Int, Sprite>());
                        cells.Add(cell, mask);
                    }

                    // The clone keeps collision and gameplay metadata, but shows only terrain pixels.
                    if (!clones.TryGetValue(tile, out var clone))
                    {
                        clone = Object.Instantiate(tile);
                        clone.name = $"WaterKeyedTile_{clones.Count}";
                        clone.sprite = tileset.TerrainSprite(tile.sprite);
                        context.AddObjectToAsset(clone.name, clone);
                        clones.Add(tile, clone);
                    }
                    source.SetTile(new TileChangeData(cell, clone, source.GetColor(cell), source.GetTransformMatrix(cell)), true);
                }
            }
            return result;
        }

        private static void Import(AssetImportContext context, Tilemap source, int pixelsPerUnit,
            WaterShorelineBuilder shorelines, Dictionary<string, Dictionary<Vector3Int, Sprite>> water,
            List<DrawnWaterBody> drawn, Vector2 swellDirection)
        {
            // Whole-tile water from metadata joins the keyed cells. Only these cells are hidden in the source layer.
            var metadataCells = new HashSet<Vector3Int>();
            foreach (var cell in source.cellBounds.allPositionsWithin)
                if (source.GetTile(cell) is VulcanusTile tile && tile.WaterType != "None")
                {
                    if (!tile.sprite)
                        throw new InvalidOperationException($"Water tile '{tile.TileId}' requires a non-empty sprite alpha mask.");
                    if (!water.TryGetValue(tile.WaterType, out var cells))
                        water.Add(tile.WaterType, cells = new Dictionary<Vector3Int, Sprite>());
                    cells.Add(cell, tile.sprite);
                    metadataCells.Add(cell);
                }

            var profiles = water.Keys.ToDictionary(type => type, type => LoadProfile(type, context), StringComparer.Ordinal);
            var masks = new Dictionary<Sprite, UnityEngine.Tilemaps.Tile>();
            // Sorted seeds give disconnected regions deterministic names on reimport.
            var seeds = water.SelectMany(pair => pair.Value.Keys.Select(cell => (type: pair.Key, cell)))
                .OrderBy(seed => seed.cell.y).ThenBy(seed => seed.cell.x).ThenBy(seed => seed.type, StringComparer.Ordinal)
                .ToArray();
            foreach (var (type, seed) in seeds)
            {
                var cells = water[type];
                if (!cells.TryGetValue(seed, out var seedSprite)) continue; // Already reached by flood fill.
                var (go, surface) = CreateSurface(source, $"Water_{type}_{seed.x}_{seed.y}");

                var pending = new Queue<(Vector3Int cell, Sprite sprite)>();
                cells.Remove(seed);
                pending.Enqueue((seed, seedSprite));
                while (pending.Count > 0)
                {
                    var (cell, sprite) = pending.Dequeue();
                    surface.SetTile(new TileChangeData(cell, MaskTile(context, source, sprite, masks), source.GetColor(cell), source.GetTransformMatrix(cell)), true);
                    if (metadataCells.Contains(cell))
                    {
                        // The authored tile still owns collision and gameplay metadata.
                        source.RemoveTileFlags(cell, TileFlags.LockColor);
                        source.SetColor(cell, Color.clear);
                    }
                    foreach (var offset in Neighbours)
                    {
                        var next = cell + offset;
                        if (!cells.Remove(next, out var nextSprite)) continue;
                        pending.Enqueue((next, nextSprite));
                    }
                }
                var shoreline = shorelines.Build(surface, context, $"{source.name}_{go.name}");
                go.AddComponent<WaterBody>().Configure(profiles[type], pixelsPerUnit, shoreline, null, swellDirection);
                go.SetActive(true);
            }

            // A drawn body is exactly one WaterBody, however its pixels are connected.
            foreach (var body in drawn)
            {
                if (body.Cells.Count == 0) continue;
                var profile = LoadProfile(body.WaterType, context);
                var (go, surface) = CreateSurface(source, $"Water_{body.Id}");
                foreach (var (cell, sprite) in body.Cells)
                    surface.SetTile(new TileChangeData(cell, MaskTile(context, source, sprite, masks), source.GetColor(cell), source.GetTransformMatrix(cell)), true);
                var assetName = $"{source.name}_{go.name}";
                var shoreline = shorelines.Build(surface, context, assetName);
                WaterFlowData currents = null;
                // Currents only show where the profile has flow enabled; the profile decides, the strokes shape it.
                if (body.Strokes.Count > 0 && profile.flowEnabled)
                {
                    if (profile.flowMap)
                        throw new InvalidOperationException($"Water body '{body.Id}' has drawn currents, but profile '{body.WaterType}' also has a flowMap. Remove one.");
                    currents = shorelines.BuildFlow(surface, body.Strokes, context, assetName);
                }
                go.AddComponent<WaterBody>().Configure(profile, pixelsPerUnit, shoreline, currents, swellDirection);
                go.SetActive(true);
            }

            WaterBankImporter.Import(context, source, drawn, shorelines, masks);
        }

        // The inactive child tilemap a body renders on; inactive so references are set before OnEnable.
        private static (GameObject go, Tilemap surface) CreateSurface(Tilemap source, string name)
        {
            var go = new GameObject(name);
            go.SetActive(false);
            go.transform.SetParent(source.transform, false);
            var surface = go.AddComponent<Tilemap>();
            surface.tileAnchor = source.tileAnchor;
            surface.color = source.color;
            var renderer = go.AddComponent<TilemapRenderer>();
            var sourceRenderer = source.GetComponent<TilemapRenderer>();
            renderer.sortingLayerID = sourceRenderer.sortingLayerID;
            renderer.sortingOrder = sourceRenderer.sortingOrder;
            renderer.sortOrder = sourceRenderer.sortOrder;
            renderer.mode = sourceRenderer.mode;
            return (go, surface);
        }

        // One collider-free tile per distinct mask sprite.
        internal static UnityEngine.Tilemaps.Tile MaskTile(AssetImportContext context, Tilemap source, Sprite sprite,
            Dictionary<Sprite, UnityEngine.Tilemaps.Tile> masks)
        {
            if (masks.TryGetValue(sprite, out var mask)) return mask;
            mask = ScriptableObject.CreateInstance<UnityEngine.Tilemaps.Tile>();
            mask.name = $"WaterMask_{source.name}_{masks.Count}";
            mask.sprite = sprite;
            mask.colliderType = UnityEngine.Tilemaps.Tile.ColliderType.None;
            context.AddObjectToAsset(mask.name, mask);
            masks.Add(sprite, mask);
            return mask;
        }
    }
}

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Core.Tile.Vulcanus;
using Core.Tile.Water;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Core.Tile.Editor.Vulcanus
{
    internal static class WaterTilemapImporter
    {
        internal const string ProfileFolder = "Assets/Content/Water";
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

        internal static void ImportAll(AssetImportContext context, IReadOnlyList<Tilemap> sources, int pixelsPerUnit,
            int mapWidth, int mapHeight, int maximumDistance)
        {
            // Vulcanus sprites use a top-centre pivot and the tilemap's half-cell anchor.
            var mapPixels = new RectInt(0, -pixelsPerUnit / 2, mapWidth * pixelsPerUnit, mapHeight * pixelsPerUnit);
            var shorelines = new WaterShorelineBuilder(sources, pixelsPerUnit, mapPixels, maximumDistance);
            foreach (var source in sources) Import(context, source, pixelsPerUnit, shorelines);
        }

        private static void Import(AssetImportContext context, Tilemap source, int pixelsPerUnit, WaterShorelineBuilder shorelines)
        {
            var water = new Dictionary<Vector3Int, VulcanusTile>();
            foreach (var cell in source.cellBounds.allPositionsWithin)
                if (source.GetTile(cell) is VulcanusTile tile && tile.WaterType != "None")
                {
                    if (!tile.sprite)
                        throw new InvalidOperationException($"Water tile '{tile.TileId}' requires a non-empty sprite alpha mask.");
                    water.Add(cell, tile);
                }

            var profiles = water.Values.Select(tile => tile.WaterType).Distinct(StringComparer.Ordinal)
                .ToDictionary(type => type, type => LoadProfile(type, context), StringComparer.Ordinal);
            var masks = new Dictionary<VulcanusTile, UnityEngine.Tilemaps.Tile>();
            // Sorted seeds give disconnected regions deterministic names on reimport.
            foreach (var seed in water.Keys.OrderBy(cell => cell.y).ThenBy(cell => cell.x).ToArray())
            {
                if (!water.TryGetValue(seed, out var first)) continue; // Already reached by flood fill.
                var go = new GameObject($"Water_{first.WaterType}_{seed.x}_{seed.y}");
                go.SetActive(false); // Configure required references before OnEnable.
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

                var pending = new Queue<Vector3Int>();
                water.Remove(seed);
                pending.Enqueue(seed);
                while (pending.Count > 0)
                {
                    var cell = pending.Dequeue();
                    var tile = (VulcanusTile)source.GetTile(cell);
                    if (!masks.TryGetValue(tile, out var mask))
                    {
                        mask = ScriptableObject.CreateInstance<UnityEngine.Tilemaps.Tile>();
                        mask.name = $"WaterMask_{source.name}_{masks.Count}";
                        mask.sprite = tile.sprite;
                        mask.colliderType = UnityEngine.Tilemaps.Tile.ColliderType.None;
                        context.AddObjectToAsset(mask.name, mask);
                        masks.Add(tile, mask);
                    }
                    surface.SetTile(new TileChangeData(cell, mask, source.GetColor(cell), source.GetTransformMatrix(cell)), true);
                    // The authored tile still owns collision and gameplay metadata.
                    source.RemoveTileFlags(cell, TileFlags.LockColor);
                    source.SetColor(cell, Color.clear);
                    foreach (var offset in Neighbours)
                    {
                        var next = cell + offset;
                        if (!water.TryGetValue(next, out var neighbour) || neighbour.WaterType != first.WaterType) continue;
                        water.Remove(next);
                        pending.Enqueue(next);
                    }
                }
                var shoreline = shorelines.Build(surface, context, $"{source.name}_{go.name}");
                go.AddComponent<WaterBody>().Configure(profiles[first.WaterType], pixelsPerUnit, shoreline);
                go.SetActive(true);
            }
        }
    }
}

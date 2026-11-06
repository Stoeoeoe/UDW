using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Core.Tile.Water;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>
    /// Bakes the banks of a drawn water layer: for each body with a bank profile, the land around it is coloured
    /// by <see cref="WaterBankField"/> and cut into one sprite per map cell on a tilemap beside the water.
    /// Banks are static ground decoration, lit like any other tile.
    /// </summary>
    internal static class WaterBankImporter
    {
        internal const string ProfileFolder = "Assets/Content/Water/Banks";

        internal static BankProfileData LoadProfile(string name, AssetImportContext context)
        {
            if (string.IsNullOrWhiteSpace(name) || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || name == "." || name == "..")
                throw new FormatException($"Invalid bankProfile '{name}': expected a profile asset name.");
            var path = $"{ProfileFolder}/{name}.asset";
            context.DependsOnSourceAsset(path);
            var profile = AssetDatabase.LoadAssetAtPath<BankProfile>(path);
            if (!profile)
                throw new InvalidOperationException($"bankProfile '{name}' requires a BankProfile at '{path}'.");
            profile.Validate();

            var layers = new List<BankLayerData>();
            foreach (var layer in profile.layers)
            {
                var data = new BankLayerData
                {
                    Kind = layer.kind,
                    Start = layer.startPixels,
                    End = layer.endPixels,
                    CoverageStart = layer.coverageStart,
                    CoverageEnd = layer.coverageEnd,
                    Color = layer.color
                };
                if (layer.texture)
                {
                    var texturePath = AssetDatabase.GetAssetPath(layer.texture);
                    context.DependsOnSourceAsset(texturePath);
                    if (!layer.texture.isReadable)
                        throw new InvalidOperationException($"Bank profile '{name}' texture '{texturePath}' must have Read/Write enabled in its import settings.");
                    data.Pixels = layer.texture.GetPixels32();
                    data.Width = layer.texture.width;
                    data.Height = layer.texture.height;
                }
                layers.Add(data);
            }
            return new BankProfileData
            {
                Layers = layers.ToArray(),
                FadeWithTransparency = profile.fadeWithTransparency,
                DitherStrength = profile.ditherStrength,
                EdgeNoise = profile.edgeNoisePixels,
                EdgeNoiseScale = profile.edgeNoiseScale,
                Depth = profile.DepthPixels,
                ShallowPixels = profile.shallowPixels,
                ShallowColor = profile.shallowColor,
                ShallowCoverage = profile.shallowCoverage
            };
        }

        internal static void Import(AssetImportContext context, Tilemap source, IReadOnlyList<DrawnWaterBody> bodies,
            WaterShorelineBuilder shorelines, Dictionary<Sprite, UnityEngine.Tilemaps.Tile> masks)
        {
            var banked = bodies.Where(body => !string.IsNullOrEmpty(body.BankProfile)).ToList();
            if (banked.Count == 0) return;
            var mask = bodies[0].Mask;
            var tile = mask.TileSize;

            // The grid is the map in Unity logical pixels: x as drawn, y up, with the half-cell offset Vulcanus sprites use.
            // Grid row gy is mask row Height - 1 - gy, so it is the mask flipped.
            var width = mask.Width;
            var height = mask.Height;
            var origin = new Vector2Int(0, -tile / 2);
            var bodyAt = new byte[width * height];
            var land = new bool[width * height];
            for (var gy = 0; gy < height; gy++)
                for (var x = 0; x < width; x++)
                {
                    var i = gy * width + x;
                    bodyAt[i] = mask.Values[(height - 1 - gy) * width + x];
                    land[i] = !shorelines.IsWater(new Vector2Int(x, origin.y + gy));
                }

            var profiles = new Dictionary<byte, BankProfileData>();
            var loaded = new Dictionary<string, BankProfileData>(StringComparer.Ordinal);
            foreach (var body in banked)
            {
                if (!loaded.TryGetValue(body.BankProfile, out var data))
                    loaded.Add(body.BankProfile, data = LoadProfile(body.BankProfile, context));
                profiles.Add(body.Value, data);
            }

            var colored = WaterBankField.Compute(bodyAt, land, origin, width, height, profiles);
            foreach (var body in banked)
            {
                if (!colored.TryGetValue(body.Value, out var pixels)) continue;
                var cells = new List<Color32[]>();
                var cellIndex = new Dictionary<Vector3Int, int>();
                for (var cy = 0; cy < height / tile; cy++)
                    for (var cx = 0; cx < width / tile; cx++)
                    {
                        var cell = new Color32[tile * tile];
                        var any = false;
                        for (var y = 0; y < tile; y++)
                            for (var x = 0; x < tile; x++)
                            {
                                var color = pixels[(cy * tile + y) * width + cx * tile + x];
                                cell[y * tile + x] = color;
                                any |= color.a != 0;
                            }
                        if (!any) continue;
                        cellIndex.Add(new Vector3Int(cx, cy, 0), cells.Count);
                        cells.Add(cell);
                    }
                if (cells.Count == 0) continue;

                var sprites = CellSpriteAtlas.Build(context, $"Bank_{source.name}_{body.Id}", cells, tile);
                var go = new GameObject($"Bank_{body.Id}");
                go.transform.SetParent(source.transform, false);
                var bank = go.AddComponent<Tilemap>();
                bank.tileAnchor = source.tileAnchor;
                bank.color = source.color;
                var renderer = go.AddComponent<TilemapRenderer>();
                var sourceRenderer = source.GetComponent<TilemapRenderer>();
                renderer.sortingLayerID = sourceRenderer.sortingLayerID;
                // Just above the water layer, so any creep into the water shows over it.
                renderer.sortingOrder = sourceRenderer.sortingOrder + 1;
                renderer.sortOrder = sourceRenderer.sortOrder;
                renderer.mode = sourceRenderer.mode;
                foreach (var (cell, index) in cellIndex)
                    bank.SetTile(new TileChangeData(cell, WaterTilemapImporter.MaskTile(context, source, sprites[index], masks), Color.white, Matrix4x4.identity), true);
            }
        }
    }
}

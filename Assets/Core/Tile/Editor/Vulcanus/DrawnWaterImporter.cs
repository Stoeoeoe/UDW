using System;
using System.Collections.Generic;
using System.Linq;
using Core.Tile.Vulcanus;
using UnityEditor.AssetImporters;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>One authored body of a drawn water layer, ready to become a <c>WaterBody</c>.</summary>
    internal sealed class DrawnWaterBody
    {
        internal string Id;
        internal string WaterType;
        /// <summary>Bank profile asset name, or empty for no bank.</summary>
        internal string BankProfile;
        /// <summary>This body's value in <see cref="Mask"/> (its list position + 1).</summary>
        internal byte Value;
        internal DrawnMask Mask;
        /// <summary>Alpha-mask sprite per map cell containing this body's pixels.</summary>
        internal Dictionary<Vector3Int, Sprite> Cells;
        internal List<FlowStrokeData> Strokes;
    }

    /// <summary>The decoded layer mask, shared by its bodies: row-major from the top-left, one body value per pixel.</summary>
    internal sealed class DrawnMask
    {
        internal byte[] Values;
        internal int Width;
        internal int Height;
        internal int TileSize;
    }

    /// <summary>
    /// Turns a hand-drawn water layer into what the tile-based water pipeline already consumes: alpha-mask sprites
    /// per map cell and body. Cells that are mostly water also receive an invisible tile that blocks movement and,
    /// when the dominant body there is freshwater, marks the cell for watering and refilling.
    /// </summary>
    internal static class DrawnWaterImporter
    {
        private const int MaximumBodies = 255;

        internal static List<DrawnWaterBody> Import(AssetImportContext context, Tilemap tilemap, LayerDto layer,
            int mapWidth, int mapHeight, int tileSize)
        {
            var bodies = layer.WaterBodies;
            ValidateBodies(bodies, layer.Name);
            var mapPixelWidth = mapWidth * tileSize;
            var values = Decode(layer.WaterMask, mapPixelWidth, mapHeight * tileSize, bodies.Count, layer.Name);

            // Unique cell patterns, in order of first appearance so reimports are deterministic.
            var patterns = new List<bool[]>();
            var patternByKey = new Dictionary<string, int>();
            var cellPatterns = bodies.Select(_ => new Dictionary<Vector3Int, int>()).ToArray();
            var blocking = new List<(Vector3Int cell, bool freshwater)>();
            var counts = new int[bodies.Count + 1];
            for (var row = 0; row < mapHeight; row++)
                for (var column = 0; column < mapWidth; column++)
                {
                    Array.Clear(counts, 0, counts.Length);
                    var cellPixels = new byte[tileSize * tileSize];
                    for (var y = 0; y < tileSize; y++)
                        for (var x = 0; x < tileSize; x++)
                        {
                            // Pattern pixels are bottom-up like sprite space; the mask is top-down.
                            var value = values[(row * tileSize + (tileSize - 1 - y)) * mapPixelWidth + column * tileSize + x];
                            cellPixels[y * tileSize + x] = value;
                            counts[value]++;
                        }
                    var total = tileSize * tileSize - counts[0];
                    if (total == 0) continue;

                    var cell = new Vector3Int(column, mapHeight - 1 - row, 0);
                    var dominant = 1;
                    for (var body = 1; body <= bodies.Count; body++)
                    {
                        if (counts[body] == 0) continue;
                        if (counts[body] > counts[dominant]) dominant = body;
                        var pattern = new bool[tileSize * tileSize];
                        for (var i = 0; i < pattern.Length; i++) pattern[i] = cellPixels[i] == body;
                        var key = Convert.ToBase64String(Pack(pattern));
                        if (!patternByKey.TryGetValue(key, out var index))
                        {
                            index = patterns.Count;
                            patternByKey.Add(key, index);
                            patterns.Add(pattern);
                        }
                        cellPatterns[body - 1].Add(cell, index);
                    }
                    if (total * 2 > tileSize * tileSize) blocking.Add((cell, bodies[dominant - 1].IsFreshwater));
                }

            var sprites = BuildSprites(context, layer.Name, patterns, tileSize);
            AddGameplayTiles(context, tilemap, layer.Name, blocking);

            var result = new List<DrawnWaterBody>();
            var drawnMask = new DrawnMask { Values = values, Width = mapPixelWidth, Height = mapHeight * tileSize, TileSize = tileSize };
            for (var i = 0; i < bodies.Count; i++)
            {
                result.Add(new DrawnWaterBody
                {
                    Id = bodies[i].Id,
                    WaterType = bodies[i].WaterType,
                    BankProfile = bodies[i].BankProfile ?? "",
                    Value = (byte)(i + 1),
                    Mask = drawnMask,
                    Cells = cellPatterns[i].ToDictionary(pair => pair.Key, pair => sprites[pair.Value]),
                    Strokes = ConvertStrokes(bodies[i], mapHeight * tileSize, tileSize, layer.Name)
                });
            }
            return result;
        }

        private static void ValidateBodies(List<WaterBodyDto> bodies, string layerName)
        {
            if (bodies.Count > MaximumBodies)
                throw new FormatException($"Water layer '{layerName}' has {bodies.Count} bodies; a mask can address {MaximumBodies}.");
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (var body in bodies)
            {
                if (string.IsNullOrWhiteSpace(body.Id) || !ids.Add(body.Id))
                    throw new FormatException($"Water layer '{layerName}' needs a unique id on every body (found '{body.Id}').");
                if (string.IsNullOrWhiteSpace(body.WaterType) || body.WaterType == "None")
                    throw new FormatException($"Water body '{body.Id}' on layer '{layerName}' requires a waterType (a profile name, not None).");
                foreach (var stroke in body.Flow)
                {
                    if (stroke.Points.Count < 2 || stroke.Points.Any(point => point == null || point.Count != 2 || !float.IsFinite(point[0]) || !float.IsFinite(point[1])))
                        throw new FormatException($"Current '{stroke.Id}' on water body '{body.Id}' needs at least two finite [x, y] points.");
                    if (!float.IsFinite(stroke.Width) || stroke.Width <= 0 || !float.IsFinite(stroke.Speed) || stroke.Speed <= 0)
                        throw new FormatException($"Current '{stroke.Id}' on water body '{body.Id}' needs a positive width and speed.");
                }
            }
        }

        /// <summary>
        /// Vulcanus map pixels are top-left origin and y-down; Unity logical pixels are y-up, offset by half a
        /// cell because Vulcanus sprites use a top-centre pivot on the tilemap's half-cell anchor.
        /// </summary>
        private static List<FlowStrokeData> ConvertStrokes(WaterBodyDto body, int mapPixelHeight, int tileSize, string layerName)
        {
            return body.Flow.Select(stroke => new FlowStrokeData(
                stroke.Points.Select(point => new Vector2(point[0], mapPixelHeight - tileSize / 2f - point[1])).ToArray(),
                stroke.Width, stroke.Speed)).ToList();
        }

        private static void AddGameplayTiles(AssetImportContext context, Tilemap tilemap, string layerName,
            List<(Vector3Int cell, bool freshwater)> blocking)
        {
            if (blocking.Count == 0) return;
            VulcanusTile Create(string name, bool freshwater)
            {
                var tile = ScriptableObject.CreateInstance<VulcanusTile>();
                tile.name = name;
                var properties = freshwater
                    ? new[] { new VulcanusTile.VulcanusTileProperty { key = "isFreshwater", jsonValue = "true" } }
                    : null;
                tile.Configure(-1, tile.name, null, TerrainType.Invalid, null, VulcanusCollisionKind.Full, properties);
                context.AddObjectToAsset(tile.name, tile);
                return tile;
            }
            VulcanusTile fresh = null;
            VulcanusTile salt = null;
            foreach (var (cell, freshwater) in blocking)
                tilemap.SetTile(cell, freshwater
                    ? fresh ??= Create($"DrawnWater_{layerName}_Freshwater", true)
                    : salt ??= Create($"DrawnWater_{layerName}_Water", false));
        }

        /// <summary>Validates the run-length mask against the map's pixel size and body count, and expands it.</summary>
        internal static byte[] Decode(WaterMaskDto mask, int width, int height, int bodyCount, string layerName)
        {
            if (mask == null) throw new FormatException($"Water layer '{layerName}' has no waterMask.");
            if (mask.Width != width || mask.Height != height)
                throw new FormatException($"Water layer '{layerName}' mask is {mask.Width}x{mask.Height} but the map is {width}x{height} pixels.");
            if (mask.Rle.Count % 2 != 0)
                throw new FormatException($"Water layer '{layerName}' mask run list must hold [body, run] pairs.");
            var pixels = new byte[width * height];
            var position = 0;
            for (var i = 0; i < mask.Rle.Count; i += 2)
            {
                var value = mask.Rle[i];
                var run = mask.Rle[i + 1];
                if (value < 0 || value > bodyCount)
                    throw new FormatException($"Water layer '{layerName}' mask uses body {value}, but the layer has {bodyCount}.");
                if (run < 0 || run > pixels.Length - position)
                    throw new FormatException($"Water layer '{layerName}' mask has an invalid run of {run} pixels.");
                if (value != 0) Array.Fill(pixels, (byte)value, position, run);
                position += run;
            }
            if (position != pixels.Length)
                throw new FormatException($"Water layer '{layerName}' mask covers {position} of {pixels.Length} pixels.");
            return pixels;
        }

        private static byte[] Pack(bool[] pattern)
        {
            var bytes = new byte[(pattern.Length + 7) / 8];
            for (var i = 0; i < pattern.Length; i++)
                if (pattern[i]) bytes[i / 8] |= (byte)(1 << (i % 8));
            return bytes;
        }

        // White where the body is: the shader only reads the mask's alpha.
        private static Sprite[] BuildSprites(AssetImportContext context, string layerName, List<bool[]> patterns, int tileSize)
        {
            var cells = patterns.Select(pattern => pattern.Select(isWater => isWater ? new Color32(255, 255, 255, 255) : default).ToArray()).ToList();
            return CellSpriteAtlas.Build(context, $"DrawnWater_{layerName}", cells, tileSize);
        }
    }
}

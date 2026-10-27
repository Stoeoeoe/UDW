using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using Core.Tile.Vulcanus;
using Core.Tile.Water;
using UnityEditor.AssetImporters;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>Rasterizes authored alpha once, then bakes padded Euclidean distance chunks.</summary>
    internal sealed class WaterShorelineBuilder
    {
        private const int Size = WaterShorelineData.ChunkSize;
        internal const string CacheDirectory = "Library/WaterShorelines";
        private readonly int _ppu;
        private readonly int _range;
        private readonly RectInt _mapPixels;
        private readonly Raster _water = new();
        private readonly Dictionary<Texture2D, Color32[]> _textures = new();

        /// <param name="sources">Source layers. Tiles with waterType metadata contribute their whole sprite alpha.</param>
        /// <param name="keyedMasks">Water mask sprites of color-keyed cells, placed with their layer's cell transform.</param>
        internal WaterShorelineBuilder(IEnumerable<Tilemap> sources,
            IEnumerable<(Tilemap source, Vector3Int cell, Sprite mask)> keyedMasks,
            int ppu, RectInt mapPixels, int maximumDistance)
        {
            if (ppu <= 0 || maximumDistance < 1 || maximumDistance > 128)
                throw new ArgumentOutOfRangeException(nameof(maximumDistance), "Water shoreline range must be 1 to 128 logical pixels, with positive PPU.");
            _ppu = ppu;
            _range = maximumDistance;
            _mapPixels = mapPixels;
            // All water types and layers share one occupancy, so touching regions never form a false coastline.
            foreach (var source in sources) Rasterize(source, _water, true);
            foreach (var (source, cell, mask) in keyedMasks)
                RasterizeCell(source, cell, mask, mask.name, _water);
        }

        internal WaterShorelineData Build(Tilemap surface, AssetImportContext context, string assetName)
        {
            var body = new Raster();
            Rasterize(surface, body, false);
            var chunks = body.Chunks.Keys.OrderBy(c => c.y).ThenBy(c => c.x).ToArray();
            if (chunks.Length == 0) throw new InvalidOperationException($"Water body '{assetName}' has no opaque mask pixels.");
            if (chunks.Length > SystemInfo.maxTextureArraySlices)
                throw new InvalidOperationException($"Water body '{assetName}' needs {chunks.Length} shoreline chunks, exceeding this platform's texture array limit. Split the authored body.");
            var min = new Vector2Int(chunks.Min(c => c.x), chunks.Min(c => c.y));
            var dimensions = new Vector2Int(chunks.Max(c => c.x) - min.x + 1, chunks.Max(c => c.y) - min.y + 1);
            if (dimensions.x > SystemInfo.maxTextureSize || dimensions.y > SystemInfo.maxTextureSize)
                throw new InvalidOperationException($"Water body '{assetName}' exceeds the shoreline page-table texture limit.");

            var distances = new Texture2DArray(Size, Size, chunks.Length, TextureFormat.RFloat, false, true)
                { name = assetName + "_Distances", filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
            var pages = new Texture2D(dimensions.x, dimensions.y, TextureFormat.RFloat, false, true)
                { name = assetName + "_Pages", filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
            var pageIndices = new float[dimensions.x * dimensions.y];
            for (var slice = 0; slice < chunks.Length; slice++)
            {
                var origin = chunks[slice] * Size;
                var length = Size + 2 * _range;
                var land = new byte[length * length];
                for (var y = 0; y < length; y++)
                    for (var x = 0; x < length; x++)
                    {
                        var pixel = origin + new Vector2Int(x - _range, y - _range);
                        // Outside the map is open water, not an artificial coastline.
                        land[y * length + x] = (byte)(_mapPixels.Contains(pixel) && !_water.Contains(pixel) ? 1 : 0);
                    }
                distances.SetPixelData(CachedChunk(land, _range), 0, slice);
                var page = chunks[slice] - min;
                pageIndices[page.y * dimensions.x + page.x] = slice + 1;
            }
            distances.Apply(false, true);
            pages.SetPixelData(pageIndices, 0);
            pages.Apply(false, true);
            context.AddObjectToAsset(distances.name, distances);
            context.AddObjectToAsset(pages.name, pages);
            var result = ScriptableObject.CreateInstance<WaterShorelineData>();
            result.name = assetName + "_Shoreline";
            result.Configure(distances, pages, min * Size, _range);
            context.AddObjectToAsset(result.name, result);
            return result;
        }

        private void Rasterize(Tilemap source, Raster target, bool authoredOnly)
        {
            foreach (var cell in source.cellBounds.allPositionsWithin)
            {
                if (source.GetTile(cell) is not UnityEngine.Tilemaps.Tile tile) continue;
                if (authoredOnly && (tile is not VulcanusTile authored || authored.WaterType == "None")) continue;
                RasterizeCell(source, cell, tile.sprite, tile.name, target);
            }
        }

        private void RasterizeCell(Tilemap source, Vector3Int cell, Sprite sprite, string tileName, Raster target)
        {
            if (!sprite || !sprite.texture.isReadable || !Mathf.Approximately(sprite.pixelsPerUnit, _ppu))
                throw new InvalidOperationException($"Water tile '{tileName}' requires a readable sprite at {_ppu} PPU.");
            if (!_textures.TryGetValue(sprite.texture, out var pixels))
                _textures.Add(sprite.texture, pixels = sprite.texture.GetPixels32());
            var rect = sprite.rect;
            var anchor = source.CellToLocal(cell) + Vector3.Scale(source.tileAnchor, source.layoutGrid.cellSize);
            var transform = source.GetTransformMatrix(cell);
            for (var y = 0; y < (int)rect.height; y++)
                for (var x = 0; x < (int)rect.width; x++)
                {
                    if (pixels[((int)rect.y + y) * sprite.texture.width + (int)rect.x + x].a == 0) continue;
                    var position = anchor + transform.MultiplyPoint3x4(new Vector3(
                        (x + 0.5f - sprite.pivot.x) / _ppu, (y + 0.5f - sprite.pivot.y) / _ppu, 0));
                    var logical = (Vector2)position * _ppu - Vector2.one * 0.5f;
                    var pixel = new Vector2Int(Mathf.RoundToInt(logical.x), Mathf.RoundToInt(logical.y));
                    if ((logical - pixel).sqrMagnitude > 0.0001f)
                        throw new InvalidOperationException($"Water tile '{tileName}' transform must preserve the logical pixel grid.");
                    target.Add(pixel);
                }
        }

        private sealed class Raster
        {
            internal readonly Dictionary<Vector2Int, BitArray> Chunks = new();
            private static Vector2Int Chunk(Vector2Int p) => new(Mathf.FloorToInt(p.x / (float)Size), Mathf.FloorToInt(p.y / (float)Size));
            internal void Add(Vector2Int p)
            {
                var chunk = Chunk(p);
                if (!Chunks.TryGetValue(chunk, out var bits)) Chunks.Add(chunk, bits = new BitArray(Size * Size));
                var local = p - chunk * Size;
                bits[local.y * Size + local.x] = true;
            }
            internal bool Contains(Vector2Int p)
            {
                var chunk = Chunk(p);
                var local = p - chunk * Size;
                return Chunks.TryGetValue(chunk, out var bits) && bits[local.y * Size + local.x];
            }
        }

        internal static float[] CachedChunk(byte[] land, int range)
        {
            var path = CachePath(land, range);
            var result = new float[Size * Size];
            if (File.Exists(path))
            {
                var cached = File.ReadAllBytes(path);
                if (cached.Length == result.Length * sizeof(float))
                {
                    Buffer.BlockCopy(cached, 0, result, 0, cached.Length);
                    return result;
                }
                // A partial derived cache is rebuilt; authored data is never repaired here.
                File.Delete(path);
            }
            var length = Size + 2 * range;
            var field = Distances(land, length, length, range);
            for (var y = 0; y < Size; y++)
                Array.Copy(field, (y + range) * length + range, result, y * Size, Size);
            var bytes = new byte[result.Length * sizeof(float)];
            Buffer.BlockCopy(result, 0, bytes, 0, bytes.Length);
            Directory.CreateDirectory(CacheDirectory);
            var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            File.WriteAllBytes(temporary, bytes);
            try { File.Move(temporary, path); }
            catch (IOException) when (File.Exists(path)) { File.Delete(temporary); } // Another import worker published the same content.
            return result;
        }

        internal static string CachePath(byte[] land, int range)
        {
            using var sha = SHA256.Create();
            var hash = BitConverter.ToString(sha.ComputeHash(land)).Replace("-", "");
            return $"{CacheDirectory}/v2-{range}-{hash}.bin";
        }

        // Exact squared Euclidean transform in two separable, linear-time passes.
        internal static float[] Distances(byte[] land, int width, int height, int maximumDistance)
        {
            if (width <= 0 || height <= 0 || land.Length != width * height || maximumDistance <= 0)
                throw new ArgumentException("Invalid shoreline distance-field dimensions or range.");
            // On a half-pixel lattice, each land square's corners, edge midpoints
            // and centre are sites. This gives exact square-boundary distances,
            // including diagonal corners, instead of subtracting 0.5 from a
            // centre-to-centre distance (which overestimates corner distances).
            var latticeWidth = width * 2 + 1;
            var latticeHeight = height * 2 + 1;
            var field = new float[latticeWidth * latticeHeight];
            Array.Fill(field, 1e12f);
            for (var y = 0; y < height; y++)
                for (var x = 0; x < width; x++)
                    if (land[y * width + x] != 0)
                        for (var sy = 0; sy < 3; sy++)
                            for (var sx = 0; sx < 3; sx++) field[(y * 2 + sy) * latticeWidth + x * 2 + sx] = 0;
            var length = Math.Max(latticeWidth, latticeHeight);
            var input = new float[length];
            var output = new float[length];
            var sites = new int[length];
            var breaks = new double[length + 1];
            for (var y = 0; y < latticeHeight; y++)
            {
                Array.Copy(field, y * latticeWidth, input, 0, latticeWidth);
                Transform(input, output, latticeWidth, sites, breaks);
                Array.Copy(output, 0, field, y * latticeWidth, latticeWidth);
            }
            for (var x = 0; x < latticeWidth; x++)
            {
                for (var y = 0; y < latticeHeight; y++) input[y] = field[y * latticeWidth + x];
                Transform(input, output, latticeHeight, sites, breaks);
                for (var y = 0; y < latticeHeight; y++) field[y * latticeWidth + x] = output[y];
            }
            var result = new float[land.Length];
            for (var y = 0; y < height; y++)
                for (var x = 0; x < width; x++)
                    result[y * width + x] = Mathf.Min(maximumDistance, Mathf.Sqrt(field[(y * 2 + 1) * latticeWidth + x * 2 + 1]) * 0.5f);
            return result;
        }

        private static void Transform(float[] input, float[] output, int count, int[] sites, double[] breaks)
        {
            var k = 0;
            sites[0] = 0;
            breaks[0] = double.NegativeInfinity;
            breaks[1] = double.PositiveInfinity;
            for (var q = 1; q < count; q++)
            {
                double intersection;
                do
                {
                    var v = sites[k];
                    intersection = ((double)input[q] + (double)q * q - input[v] - (double)v * v) / (2 * (q - v));
                    if (intersection > breaks[k]) break;
                    k--;
                } while (k >= 0);
                k++;
                sites[k] = q;
                breaks[k] = intersection;
                breaks[k + 1] = double.PositiveInfinity;
            }
            k = 0;
            for (var q = 0; q < count; q++)
            {
                while (breaks[k + 1] < q) k++;
                var delta = q - sites[k];
                output[q] = delta * delta + input[sites[k]];
            }
        }
    }
}

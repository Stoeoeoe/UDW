using System;
using System.Collections.Generic;
using Core.Tile.Water;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>A bank layer with its textures read into memory.</summary>
    internal sealed class BankLayerData
    {
        internal BankLayerKind Kind;
        internal float Start, End, CoverageStart, CoverageEnd;
        internal Color32 Color;
        /// <summary>Row-major from the bottom, like a Texture2D; null for a flat-colour band.</summary>
        internal Color32[] Pixels;
        internal int Width, Height;
    }

    internal sealed class BankProfileData
    {
        internal BankLayerData[] Layers;
        internal float EdgeNoise, EdgeNoiseScale;
        internal int Depth;
        /// <summary>Coverage below 1 fades alpha instead of dithering pixels in and out.</summary>
        internal bool FadeWithTransparency;
        /// <summary>With transparency: how far the ordered dither pattern moves each pixel's opacity (0 is smooth).</summary>
        internal float DitherStrength;
        /// <summary>How far the bank creeps into the water from the shore; 0 for none.</summary>
        internal int ShallowPixels;
        internal Color32 ShallowColor;
        internal float ShallowCoverage;
    }

    /// <summary>
    /// Colours the land around drawn water. Every land pixel belongs to the nearest drawn body, and takes the first
    /// layer of that body's bank profile that claims it, from its distance to the water and, for strips, its
    /// position along the shoreline. Pure and deterministic: the same drawing always bakes the same bank.
    /// </summary>
    internal static class WaterBankField
    {
        private static readonly int[] Bayer = { 0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5 };

        /// <param name="bodyAt">Per pixel: the drawn body's value (1 to 255), or 0 where there is none.</param>
        /// <param name="land">Per pixel: whether a bank may be drawn there (inside the map and not water of any kind).</param>
        /// <param name="origin">Absolute logical pixel of grid cell (0, 0); noise and textures are sampled in absolute pixels.</param>
        /// <param name="profiles">Bank profile per body value; bodies without one still claim the land nearest to them.</param>
        /// <returns>For each body with a profile, a colour per grid pixel (alpha 0 where it has no bank).</returns>
        internal static Dictionary<byte, Color32[]> Compute(byte[] bodyAt, bool[] land, Vector2Int origin, int width, int height,
            IReadOnlyDictionary<byte, BankProfileData> profiles)
        {
            var result = new Dictionary<byte, Color32[]>();
            if (profiles.Count == 0) return result;
            var reach = 0;
            foreach (var profile in profiles.Values) reach = Math.Max(reach, profile.Depth);

            // Nearest body per land pixel. Bodies with no profile still compete, so they keep banks off their shores.
            var values = new SortedSet<byte>();
            foreach (var value in bodyAt) if (value != 0) values.Add(value);
            var nearest = new float[bodyAt.Length];
            Array.Fill(nearest, float.MaxValue);
            var owner = new byte[bodyAt.Length];
            foreach (var value in values)
            {
                var sites = new byte[bodyAt.Length];
                for (var i = 0; i < sites.Length; i++) sites[i] = (byte)(bodyAt[i] == value ? 1 : 0);
                var distance = WaterShorelineBuilder.Distances(sites, width, height, reach + 1);
                for (var i = 0; i < distance.Length; i++)
                    if (land[i] && distance[i] < nearest[i]) { nearest[i] = distance[i]; owner[i] = value; }
            }

            // The creep into the water: only a body's own pixels, near land, dithered thinner the farther out.
            var shallowReach = 0;
            foreach (var profile in profiles.Values) shallowReach = Math.Max(shallowReach, profile.ShallowPixels);
            if (shallowReach > 0)
            {
                var landSites = new byte[bodyAt.Length];
                for (var i = 0; i < landSites.Length; i++) landSites[i] = (byte)(land[i] ? 1 : 0);
                var inland = WaterShorelineBuilder.Distances(landSites, width, height, shallowReach + 1);
                for (var i = 0; i < bodyAt.Length; i++)
                {
                    if (bodyAt[i] == 0 || !profiles.TryGetValue(bodyAt[i], out var own) || own.ShallowPixels <= 0) continue;
                    var inward = inland[i] - 0.5f; // The first water pixel is 0.
                    if (inward >= own.ShallowPixels) continue;
                    var worldX = origin.x + i % width;
                    var worldY = origin.y + i / width;
                    var coverage = own.ShallowCoverage * (1 - inward / own.ShallowPixels);
                    var shallowColor = Cover(own.ShallowColor, coverage, own, 0, worldX, worldY);
                    if (shallowColor.a == 0) continue;
                    if (!result.TryGetValue(bodyAt[i], out var shallows)) result.Add(bodyAt[i], shallows = new Color32[bodyAt.Length]);
                    shallows[i] = shallowColor;
                }
            }

            var shores = new Dictionary<byte, ShoreCoordinates>();
            for (var i = 0; i < owner.Length; i++)
            {
                if (owner[i] == 0 || !profiles.TryGetValue(owner[i], out var profile)) continue;
                var depth = nearest[i] - 0.5f; // The first land pixel is 0.
                if (depth >= profile.Depth) continue;
                var x = i % width;
                var y = i / width;
                var color = ColorAt(profile, origin.x + x, origin.y + y, depth, () =>
                {
                    if (!shores.TryGetValue(owner[i], out var shore))
                        shores.Add(owner[i], shore = ShoreCoordinates.Build(bodyAt, land, owner[i], width, height));
                    return shore;
                }, x, y);
                if (color.a == 0) continue;
                if (!result.TryGetValue(owner[i], out var pixels)) result.Add(owner[i], pixels = new Color32[bodyAt.Length]);
                pixels[i] = color;
            }
            return result;
        }

        private static Color32 ColorAt(BankProfileData profile, int worldX, int worldY, float depth,
            Func<ShoreCoordinates> shore, int gridX, int gridY)
        {
            // Band edges wander so they read as a bank, not a copy of the shoreline; never inside the water's edge,
            // which would leave a bare gap beside it.
            var wandered = Mathf.Max(0, depth + (Noise(worldX, worldY, profile.EdgeNoiseScale) * 2 - 1) * profile.EdgeNoise);
            foreach (var layer in profile.Layers)
            {
                if (layer.Kind == BankLayerKind.Band)
                {
                    if (wandered < layer.Start || wandered >= layer.End) continue;
                    var coverage = Mathf.Lerp(layer.CoverageStart, layer.CoverageEnd, (wandered - layer.Start) / (layer.End - layer.Start));
                    var color = Cover(layer.Pixels == null
                        ? layer.Color
                        : layer.Pixels[Mod(worldY, layer.Height) * layer.Width + Mod(worldX, layer.Width)],
                        coverage, profile, profile.DitherStrength, worldX, worldY);
                    if (color.a > 0) return color;
                    continue;
                }

                var row = Mathf.Max(0, Mathf.FloorToInt(depth));
                if (row >= layer.Height) continue;
                var stripCoverage = Mathf.Lerp(layer.CoverageStart, layer.CoverageEnd, (row + 0.5f) / layer.Height);
                if (!shore().TryNearest(gridX, gridY, Mathf.CeilToInt(depth) + 2, out var raw, out var loop)) continue;
                var along = Mod(Mathf.FloorToInt(StripCoordinate(raw, loop, layer.Width)), layer.Width);
                // The top row lies against the water.
                var stripColor = Cover(layer.Pixels[(layer.Height - 1 - row) * layer.Width + along], stripCoverage, profile, profile.DitherStrength, worldX, worldY);
                if (stripColor.a > 0) return stripColor;
            }
            return default;
        }

        // A colour at a share of coverage: dithered in or out by position, or faded in alpha. A faded pixel's opacity
        // is nudged up or down by the dither pattern, so the fade carries a little pixel texture.
        private static Color32 Cover(Color32 color, float coverage, BankProfileData profile, float ditherStrength, int worldX, int worldY)
        {
            if (color.a == 0 || coverage <= 0) return default;
            var threshold = (Bayer[(worldX & 3) + (worldY & 3) * 4] + 0.5f) / 16;
            if (!profile.FadeWithTransparency) return threshold < coverage ? color : default;
            var opacity = Mathf.Clamp01(coverage + (threshold - 0.5f) * ditherStrength);
            color.a = (byte)Mathf.RoundToInt(color.a * opacity);
            return color.a == 0 ? default : color;
        }

        /// <summary>
        /// Position along the shore, in strip columns. A closed shoreline is stretched slightly to hold a whole
        /// number of repeats, so the art meets itself where the loop closes; an open one is left alone.
        /// </summary>
        internal static float StripCoordinate(float raw, float loopLength, int stripWidth)
        {
            if (loopLength <= 0) return raw;
            var repeats = Math.Max(1, Mathf.RoundToInt(loopLength / stripWidth));
            return raw * (repeats * stripWidth / loopLength);
        }

        private static int Mod(int value, int by) => (value % by + by) % by;

        // A broad swing at `scale` pixels with finer roughness on top, so widths vary along the shore and edges are not smooth.
        private static float Noise(int x, int y, float scale) =>
            0.7f * ValueNoise(x, y, scale) + 0.3f * ValueNoise(x + 97, y + 57, Mathf.Max(1, scale / 3));

        // Smooth value noise on a lattice of `scale` pixels, in [0, 1].
        private static float ValueNoise(int x, int y, float scale)
        {
            var px = x / scale;
            var py = y / scale;
            var ix = Mathf.FloorToInt(px);
            var iy = Mathf.FloorToInt(py);
            var fx = px - ix;
            var fy = py - iy;
            fx = fx * fx * (3 - 2 * fx);
            fy = fy * fy * (3 - 2 * fy);
            return Mathf.Lerp(Mathf.Lerp(Hash(ix, iy), Hash(ix + 1, iy), fx), Mathf.Lerp(Hash(ix, iy + 1), Hash(ix + 1, iy + 1), fx), fy);
        }

        private static float Hash(int x, int y)
        {
            unchecked
            {
                var h = (uint)x * 374761393u + (uint)y * 668265263u + 2246822519u;
                h = (h ^ (h >> 13)) * 1274126177u;
                return ((h ^ (h >> 16)) & 0xFFFFFFu) / 16777216f;
            }
        }
    }

    /// <summary>
    /// Arc length along the line between one body's pixels and the land, for laying strip art along a shore.
    /// The line is made of unit pixel edges with the water on its left; a chain follows it round bends, and a chain
    /// that returns to its start is a closed loop. Edges are stored by midpoint on a lattice of half-pixels.
    /// </summary>
    internal sealed class ShoreCoordinates
    {
        private readonly float[] _along;
        private readonly float[] _loop;
        private readonly int _latticeWidth;
        private readonly int _latticeHeight;

        private ShoreCoordinates(int width, int height)
        {
            _latticeWidth = width * 2 + 1;
            _latticeHeight = height * 2 + 1;
            _along = new float[_latticeWidth * _latticeHeight];
            _loop = new float[_along.Length];
            Array.Fill(_along, -1f);
        }

        internal static ShoreCoordinates Build(byte[] bodyAt, bool[] land, byte value, int width, int height)
        {
            bool IsBody(int x, int y) => x >= 0 && y >= 0 && x < width && y < height && bodyAt[y * width + x] == value;
            bool IsLand(int x, int y) => x >= 0 && y >= 0 && x < width && y < height && land[y * width + x];

            // Directed edges around each body pixel, counter-clockwise, wherever the neighbour is land.
            var edges = new List<(int x0, int y0, int x1, int y1)>();
            for (var y = 0; y < height; y++)
                for (var x = 0; x < width; x++)
                {
                    if (!IsBody(x, y)) continue;
                    if (IsLand(x + 1, y)) edges.Add((x + 1, y, x + 1, y + 1));
                    if (IsLand(x, y + 1)) edges.Add((x + 1, y + 1, x, y + 1));
                    if (IsLand(x - 1, y)) edges.Add((x, y + 1, x, y));
                    if (IsLand(x, y - 1)) edges.Add((x, y, x + 1, y));
                }

            int Vertex(int x, int y) => y * (width + 1) + x;
            var startingAt = new Dictionary<int, List<int>>();
            var hasIncoming = new HashSet<int>();
            for (var e = 0; e < edges.Count; e++)
            {
                var vertex = Vertex(edges[e].x0, edges[e].y0);
                if (!startingAt.TryGetValue(vertex, out var list)) startingAt.Add(vertex, list = new List<int>());
                list.Add(e);
                hasIncoming.Add(Vertex(edges[e].x1, edges[e].y1));
            }

            var visited = new bool[edges.Count];
            // Where two edges leave a vertex (water pixels touching at a corner), the sharpest left turn keeps each
            // pixel's outline its own.
            int Next(int edge)
            {
                var (x0, y0, x1, y1) = edges[edge];
                if (!startingAt.TryGetValue(Vertex(x1, y1), out var candidates)) return -1;
                var best = -1;
                var bestTurn = int.MinValue;
                foreach (var candidate in candidates)
                {
                    if (visited[candidate]) continue;
                    var (cx0, cy0, cx1, cy1) = edges[candidate];
                    var turn = (x1 - x0) * (cy1 - cy0) - (y1 - y0) * (cx1 - cx0);
                    if (turn > bestTurn) { best = candidate; bestTurn = turn; }
                }
                return best;
            }

            var shore = new ShoreCoordinates(width, height);
            void Trace(int first)
            {
                var chain = new List<int>();
                var edge = first;
                while (edge >= 0 && !visited[edge])
                {
                    visited[edge] = true;
                    chain.Add(edge);
                    edge = Next(edge);
                }
                var (sx, sy, _, _) = edges[chain[0]];
                var (_, _, ex, ey) = edges[chain[chain.Count - 1]];
                var closed = sx == ex && sy == ey;
                for (var i = 0; i < chain.Count; i++)
                {
                    var (x0, y0, x1, y1) = edges[chain[i]];
                    var at = (y0 + y1) * shore._latticeWidth + (x0 + x1);
                    shore._along[at] = i + 0.5f;
                    shore._loop[at] = closed ? chain.Count : 0;
                }
            }

            // Open chains first, from the edge nothing leads into; whatever is left is a closed loop.
            for (var e = 0; e < edges.Count; e++)
                if (!visited[e] && !hasIncoming.Contains(Vertex(edges[e].x0, edges[e].y0))) Trace(e);
            for (var e = 0; e < edges.Count; e++)
                if (!visited[e]) Trace(e);
            return shore;
        }

        /// <summary>The position along the shore of the edge nearest the centre of pixel (x, y), within `radius` pixels.</summary>
        internal bool TryNearest(int x, int y, int radius, out float along, out float loopLength)
        {
            var centreX = x * 2 + 1;
            var centreY = y * 2 + 1;
            var best = int.MaxValue;
            along = 0;
            loopLength = 0;
            for (var dy = -radius * 2 - 1; dy <= radius * 2 + 1; dy++)
            {
                var my = centreY + dy;
                if (my < 0 || my >= _latticeHeight) continue;
                for (var dx = -radius * 2 - 1; dx <= radius * 2 + 1; dx++)
                {
                    var mx = centreX + dx;
                    if (mx < 0 || mx >= _latticeWidth) continue;
                    var at = my * _latticeWidth + mx;
                    if (_along[at] < 0) continue;
                    var distance = dx * dx + dy * dy;
                    if (distance >= best) continue;
                    best = distance;
                    along = _along[at];
                    loopLength = _loop[at];
                }
            }
            return best != int.MaxValue;
        }
    }
}

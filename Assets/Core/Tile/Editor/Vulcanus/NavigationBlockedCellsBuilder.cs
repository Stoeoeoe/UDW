using System;
using System.Collections.Generic;
using System.Linq;
using Core.Tile.Vulcanus;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>
    /// Bakes which cells of a map a character cannot stand on, from the same static collision Unity builds at import,
    /// so routes can be planned without loading the map. A cell is blocked when collision covers the middle half of
    /// the tile. Placed entities and other runtime objects are not included; live walking still asks physics.
    /// Mirrors Vulcanus computeBlockedGrid (app/src/lib/navigationPath.ts).
    /// </summary>
    internal static class NavigationBlockedCellsBuilder
    {
        /// <summary>Half the side of the box, centred on a cell, that must be free for a character to stand there.</summary>
        private const float FootprintHalf = 0.25f;
        private const int CircleSegments = 12;

        /// <summary>Blocked cells in Unity cell order (row 0 is the map's bottom row), like <see cref="NavigationCostGrid"/>.</summary>
        public static bool[] Build(IReadOnlyList<LayerDto> layers, IList<VulcanusTilesetAsset> tilesetsByIndex,
            IReadOnlyList<MapCollisionDto> collisions, int width, int height, int tileSize)
        {
            // Worked out in Vulcanus cells (row 0 at the top), then flipped once.
            var blocked = new bool[width * height];
            void Block(int x, int y)
            {
                if (x >= 0 && y >= 0 && x < width && y < height) blocked[y * width + x] = true;
            }
            bool IsBlocked(int x, int y) => blocked[y * width + x];
            // Blocks every cell whose middle the polygon (in Vulcanus tile units) overlaps.
            void BlockUnder(Vector2[] polygon)
            {
                var minX = Mathf.Max(0, Mathf.FloorToInt(polygon.Min(point => point.x)));
                var maxX = Mathf.Min(width - 1, Mathf.FloorToInt(polygon.Max(point => point.x)));
                var minY = Mathf.Max(0, Mathf.FloorToInt(polygon.Min(point => point.y)));
                var maxY = Mathf.Min(height - 1, Mathf.FloorToInt(polygon.Max(point => point.y)));
                for (var y = minY; y <= maxY; y++)
                    for (var x = minX; x <= maxX; x++)
                        if (!IsBlocked(x, y) && PolygonOverlapsBox(polygon, Footprint(x, y))) Block(x, y);
            }

            foreach (var layer in layers.Where(layer => layer.Visible))
            {
                if (IsKind(layer, "visual", "terrain") && layer.Data != null)
                    foreach (var cell in Cells(layer.Data))
                    {
                        if (cell.X < 0 || cell.Y < 0 || cell.X >= width || cell.Y >= height || IsBlocked(cell.X, cell.Y)) continue;
                        if (TryGetTile(cell.Encoded, tilesetsByIndex, out var tile))
                            foreach (var polygon in TilePolygons(tile, new Vector2(cell.X, cell.Y))) BlockUnder(polygon);
                    }
                else if (IsKind(layer, "object"))
                    foreach (var instance in layer.ObjectInstances)
                    {
                        var tileset = tilesetsByIndex.FirstOrDefault(candidate =>
                            candidate && string.Equals(candidate.TilesetId, instance.TilesetId, StringComparison.OrdinalIgnoreCase));
                        if (!tileset || !tileset.TryGetObjectDefinition(instance.ObjectDefinitionId, out var definition))
                            throw new InvalidOperationException(
                                $"Object '{instance.Id}' references missing tileset or object '{instance.TilesetId}/{instance.ObjectDefinitionId}'.");
                        // Objects stand at their exact pixel position, which need not be a whole tile.
                        var origin = new Vector2(instance.X, instance.Y) / tileSize;
                        foreach (var part in definition.tiles)
                            if (tileset.TryGetTile(part.tileIndex, out var tile))
                                foreach (var polygon in TilePolygons(tile, origin + new Vector2(part.x, part.y))) BlockUnder(polygon);
                    }
                else if (IsKind(layer, "water") && layer.WaterMask != null)
                    BlockWater(layer, width, height, tileSize, Block);
            }

            foreach (var collision in collisions)
            {
                var polygon = CollisionPolygon(collision, tileSize);
                if (polygon.Length >= 3) BlockUnder(polygon);
            }

            var flipped = new bool[width * height];
            for (var y = 0; y < height; y++)
                Array.Copy(blocked, y * width, flipped, (height - 1 - y) * width, width);
            return flipped;
        }

        /// <summary>
        /// A tile's collision as polygons placed at <paramref name="topLeft"/> (Vulcanus tile units): "full" tiles fill
        /// the tile, "complex" tiles collide with their polygon and rectangle shapes, as the imported physics shape does.
        /// </summary>
        private static IEnumerable<Vector2[]> TilePolygons(VulcanusTile tile, Vector2 topLeft)
        {
            if (tile.CollisionKind == VulcanusCollisionKind.Full)
            {
                yield return new[] { topLeft, topLeft + Vector2.right, topLeft + Vector2.one, topLeft + Vector2.up };
                yield break;
            }
            if (tile.CollisionKind != VulcanusCollisionKind.Complex) yield break;
            foreach (var shape in tile.CollisionShapes)
            {
                var points = shape.type == "rectangle"
                    ? new[]
                    {
                        new Vector2(shape.x, shape.y), new Vector2(shape.x + shape.width, shape.y),
                        new Vector2(shape.x + shape.width, shape.y + shape.height), new Vector2(shape.x, shape.y + shape.height)
                    }
                    : shape.type == "polygon" && shape.points is { Length: >= 3 } ? shape.points : null;
                if (points != null) yield return points.Select(point => topLeft + point).ToArray();
            }
        }

        /// <summary>Drawn water blocks a cell when it covers more than half of its pixels, like its imported collider.</summary>
        private static void BlockWater(LayerDto layer, int width, int height, int tileSize, Action<int, int> block)
        {
            var pixelWidth = width * tileSize;
            var values = DrawnWaterImporter.Decode(layer.WaterMask, pixelWidth, height * tileSize, layer.WaterBodies.Count, layer.Name);
            for (var y = 0; y < height; y++)
                for (var x = 0; x < width; x++)
                {
                    var water = 0;
                    for (var py = 0; py < tileSize; py++)
                        for (var px = 0; px < tileSize; px++)
                            if (values[(y * tileSize + py) * pixelWidth + x * tileSize + px] != 0) water++;
                    if (water * 2 > tileSize * tileSize) block(x, y);
                }
        }

        /// <summary>A map collision shape in Vulcanus tile units (y down).</summary>
        private static Vector2[] CollisionPolygon(MapCollisionDto collision, int tileSize)
        {
            float px = collision.Position is { Count: > 0 } ? collision.Position[0] : 0f;
            float py = collision.Position is { Count: > 1 } ? collision.Position[1] : 0f;
            if (string.Equals(collision.Shape, "circle", StringComparison.OrdinalIgnoreCase))
                return Enumerable.Range(0, CircleSegments).Select(i =>
                {
                    var angle = i / (float)CircleSegments * Mathf.PI * 2f;
                    return new Vector2(px + Mathf.Cos(angle) * collision.Radius, py + Mathf.Sin(angle) * collision.Radius) / tileSize;
                }).ToArray();
            if (string.Equals(collision.Shape, "polygon", StringComparison.OrdinalIgnoreCase))
                return collision.Points.Where(point => point is { Count: >= 2 })
                    .Select(point => new Vector2(point[0], point[1]) / tileSize).ToArray();
            float w = collision.Size is { Count: > 0 } ? collision.Size[0] : 0f;
            float h = collision.Size is { Count: > 1 } ? collision.Size[1] : 0f;
            return new[]
            {
                new Vector2(px, py) / tileSize, new Vector2(px + w, py) / tileSize,
                new Vector2(px + w, py + h) / tileSize, new Vector2(px, py + h) / tileSize
            };
        }

        private static Rect Footprint(int x, int y) =>
            Rect.MinMaxRect(x + 0.5f - FootprintHalf, y + 0.5f - FootprintHalf, x + 0.5f + FootprintHalf, y + 0.5f + FootprintHalf);

        /// <summary>Whether a polygon and a box share any area or edge.</summary>
        internal static bool PolygonOverlapsBox(Vector2[] polygon, Rect box)
        {
            bool Inside(Vector2 point) => point.x > box.xMin && point.x < box.xMax && point.y > box.yMin && point.y < box.yMax;
            if (polygon.Any(Inside)) return true;
            var corners = new[] { box.min, new Vector2(box.xMax, box.yMin), box.max, new Vector2(box.xMin, box.yMax) };
            if (corners.Any(corner => PointInPolygon(corner, polygon))) return true;
            for (var i = 0; i < polygon.Length; i++)
                for (var j = 0; j < 4; j++)
                    if (SegmentsCross(polygon[i], polygon[(i + 1) % polygon.Length], corners[j], corners[(j + 1) % 4])) return true;
            return false;
        }

        private static bool PointInPolygon(Vector2 point, Vector2[] polygon)
        {
            var inside = false;
            for (int i = 0, j = polygon.Length - 1; i < polygon.Length; j = i++)
                if (polygon[i].y > point.y != polygon[j].y > point.y &&
                    point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)
                    inside = !inside;
            return inside;
        }

        private static bool SegmentsCross(Vector2 a, Vector2 b, Vector2 c, Vector2 d)
        {
            static float Cross(Vector2 o, Vector2 p, Vector2 q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
            return Cross(c, d, a) * Cross(c, d, b) < 0 && Cross(a, b, c) * Cross(a, b, d) < 0;
        }

        /// <summary>A painted cell of a tile layer, in Vulcanus cells.</summary>
        private readonly struct TileCell
        {
            public readonly int X, Y, Encoded;
            public TileCell(int x, int y, int encoded) { X = x; Y = y; Encoded = encoded; }
        }

        private static IEnumerable<TileCell> Cells(JToken data)
        {
            if (data is JArray rows)
            {
                for (var y = 0; y < rows.Count; y++)
                    if (rows[y] is JArray row)
                        for (var x = 0; x < row.Count; x++)
                            if (VulcanusImportHelpers.TryReadInt(row[x], out var encoded))
                                yield return new TileCell(x, y, encoded);
                yield break;
            }
            if (data is not JObject sparse || sparse.Value<bool?>("sparse") != true || sparse["entries"] is not JArray entries) yield break;
            foreach (var entry in entries.OfType<JObject>())
                if (VulcanusImportHelpers.TryReadInt(entry["x"], out var x) && VulcanusImportHelpers.TryReadInt(entry["y"], out var y) &&
                    VulcanusImportHelpers.TryReadInt(entry["v"], out var encoded))
                    yield return new TileCell(x, y, encoded);
        }

        private static bool TryGetTile(int encoded, IList<VulcanusTilesetAsset> tilesetsByIndex, out VulcanusTile tile)
        {
            tile = null;
            if (encoded < 0 || encoded >> 16 >= tilesetsByIndex.Count) return false;
            var tileset = tilesetsByIndex[encoded >> 16];
            return tileset && tileset.TryGetTile(encoded & 0xFFFF, out tile);
        }

        private static bool IsKind(LayerDto layer, params string[] kinds) =>
            kinds.Any(kind => string.Equals(layer.Kind, kind, StringComparison.OrdinalIgnoreCase));

    }
}

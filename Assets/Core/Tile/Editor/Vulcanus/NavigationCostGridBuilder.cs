using System;
using System.Collections.Generic;
using System.Linq;
using Core.Tile.Vulcanus;
using Newtonsoft.Json.Linq;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>
    /// Bakes <see cref="NavigationCostGrid"/>. A cell starts with the terrain layer tile's cost (default 2 if it has none);
    /// every other visible tile or object layer, in ascending zOrder, overrides it where its tile has a cost.
    /// Tiles without a cost are transparent. The terrain layer is the first visible terrain layer with tile data,
    /// matching the terrain tilemap chosen by <see cref="MapImporter"/>. Mirrors Vulcanus computeNavigationCostGrid.
    /// </summary>
    internal static class NavigationCostGridBuilder
    {
        public static NavigationCostGrid Build(
            IReadOnlyList<LayerDto> layers,
            IList<VulcanusTilesetAsset> tilesetsByIndex,
            IReadOnlyList<MapCollisionDto> collisions,
            int width,
            int height,
            int tileSize)
        {
            var costs = new byte[width * height];
            Array.Fill(costs, (byte)NavigationCostGrid.DefaultCost);

            var tileLayers = layers.Where(layer => layer.Visible && IsKind(layer, "visual", "terrain", "object")).ToList();
            var terrain = tileLayers.FirstOrDefault(layer => IsKind(layer, "terrain") && layer.Data != null);
            if (terrain != null) ApplyTileLayer(terrain, tilesetsByIndex, costs, width, height);

            foreach (var layer in tileLayers.Where(layer => layer != terrain).OrderBy(layer => layer.ZOrder))
            {
                if (IsKind(layer, "object")) ApplyObjectLayer(layer, tilesetsByIndex, costs, width, height, tileSize);
                else if (layer.Data != null) ApplyTileLayer(layer, tilesetsByIndex, costs, width, height);
            }

            return new NavigationCostGrid(width, height, costs,
                NavigationBlockedCellsBuilder.Build(layers, tilesetsByIndex, collisions, width, height, tileSize));
        }

        private static bool IsKind(LayerDto layer, params string[] kinds) =>
            kinds.Any(kind => string.Equals(layer.Kind, kind, StringComparison.OrdinalIgnoreCase));

        private static void ApplyTileLayer(
            LayerDto layer, IList<VulcanusTilesetAsset> tilesetsByIndex, byte[] costs, int width, int height)
        {
            if (layer.Data is JArray rows)
            {
                for (var y = 0; y < rows.Count; y++)
                {
                    if (rows[y] is not JArray row) continue;
                    for (var x = 0; x < row.Count; x++)
                        if (VulcanusImportHelpers.TryReadInt(row[x], out var encoded))
                            SetCost(costs, width, height, x, y, TileCost(encoded, tilesetsByIndex));
                }
                return;
            }

            if (layer.Data is not JObject sparse || sparse.Value<bool?>("sparse") != true ||
                sparse["entries"] is not JArray entries) return;
            foreach (var entry in entries.OfType<JObject>())
            {
                if (VulcanusImportHelpers.TryReadInt(entry["x"], out var x) &&
                    VulcanusImportHelpers.TryReadInt(entry["y"], out var y) &&
                    VulcanusImportHelpers.TryReadInt(entry["v"], out var encoded))
                    SetCost(costs, width, height, x, y, TileCost(encoded, tilesetsByIndex));
            }
        }

        private static void ApplyObjectLayer(
            LayerDto layer, IList<VulcanusTilesetAsset> tilesetsByIndex, byte[] costs, int width, int height, int tileSize)
        {
            var claimed = new HashSet<(int, int)>(); // the first instance covering a cell wins
            foreach (var instance in layer.ObjectInstances)
            {
                var tileset = tilesetsByIndex.FirstOrDefault(candidate =>
                    candidate && candidate.TilesetId == instance.TilesetId);
                if (!tileset || !tileset.TryGetObjectDefinition(instance.ObjectDefinitionId, out var definition))
                    throw new InvalidOperationException(
                        $"Object '{instance.Id}' references missing tileset or object '{instance.TilesetId}/{instance.ObjectDefinitionId}'.");

                var originX = FloorDiv(instance.X, tileSize);
                var originY = FloorDiv(instance.Y, tileSize);
                foreach (var tile in definition.tiles)
                {
                    var x = originX + tile.x;
                    var y = originY + tile.y;
                    if (!claimed.Add((x, y))) continue;
                    if (tileset.TryGetTile(tile.tileIndex, out var vulcanusTile) && vulcanusTile.TryGetNavigationCost(out var cost))
                        SetCost(costs, width, height, x, y, cost);
                }
            }
        }

        private static int TileCost(int encodedTile, IList<VulcanusTilesetAsset> tilesetsByIndex)
        {
            if (encodedTile < 0) return 0;
            var tilesetIndex = encodedTile >> 16;
            if (tilesetIndex >= tilesetsByIndex.Count) return 0;
            var tileset = tilesetsByIndex[tilesetIndex];
            return tileset && tileset.TryGetTile(encodedTile & 0xFFFF, out var tile) && tile.TryGetNavigationCost(out var cost)
                ? cost
                : 0;
        }

        /// <summary>Writes a Unity-cell cost for a Vulcanus (x, y) cell; cost 0 means no cost and leaves the cell alone.</summary>
        private static void SetCost(byte[] costs, int width, int height, int x, int vulcanusY, int cost)
        {
            if (cost <= 0 || x < 0 || x >= width || vulcanusY < 0 || vulcanusY >= height) return;
            costs[(height - 1 - vulcanusY) * width + x] = (byte)cost;
        }

        private static int FloorDiv(int value, int divisor) => (int)Math.Floor(value / (double)divisor);
    }
}

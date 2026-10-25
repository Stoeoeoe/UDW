using System;
using Core.Tile.Vulcanus;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>A point measured in pixels from the map's top-left corner.</summary>
    [Serializable]
    public struct MapPixelPosition
    {
        [SerializeField] private double x;
        [SerializeField] private double y;
        public double X => x;
        public double Y => y;

        public MapPixelPosition(double x, double y)
        {
            if (!double.IsFinite(x) || !double.IsFinite(y) || x < 0 || y < 0)
                throw new ArgumentOutOfRangeException(nameof(x), "Map position x/y must be finite, nonnegative pixel coordinates.");
            this.x = x;
            this.y = y;
        }

        public Vector3 ToWorld(VulcanusImportedMap map)
        {
            if (x > (double)map.Width * map.TileSize || y > (double)map.Height * map.TileSize)
                throw new ArgumentOutOfRangeException(nameof(map), $"Position ({x}, {y}) is outside map '{map.MapId}'.");
            return map.transform.TransformPoint(new Vector3((float)(x / map.TileSize), (float)(map.Height - y / map.TileSize), 0));
        }
    }
}

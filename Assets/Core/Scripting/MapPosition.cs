using System;
using System.Linq;
using Core.Tile.Vulcanus;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>A map point selected as pixels/tile centers, or by an authored anchor ID.</summary>
    [Serializable]
    public struct MapPosition
    {
        [SerializeField] private double x;
        [SerializeField] private double y;
        [SerializeField] private string anchor;
        // Unity serializes an absent string as empty, including pixel points in compiled steps.
        public bool IsAnchor => !string.IsNullOrEmpty(anchor);
        public string Anchor => IsAnchor ? anchor : throw new InvalidOperationException("This position is a pixel point.");
        public double X => !IsAnchor ? x : throw new InvalidOperationException("An anchor position has no fixed pixel X.");
        public double Y => !IsAnchor ? y : throw new InvalidOperationException("An anchor position has no fixed pixel Y.");

        public MapPosition(double x, double y)
        {
            if (!double.IsFinite(x) || !double.IsFinite(y) || x < 0 || y < 0)
                throw new ArgumentOutOfRangeException(nameof(x), "Map position x/y must be finite, nonnegative pixel coordinates.");
            this.x = x;
            this.y = y;
            anchor = null;
        }

        public MapPosition(string anchor)
        {
            if (string.IsNullOrWhiteSpace(anchor)) throw new ArgumentException("A position anchor ID is required.", nameof(anchor));
            this.anchor = anchor;
            x = y = 0;
        }

        public Vector3 ToWorld(VulcanusImportedMap map)
        {
            if (IsAnchor)
            {
                var id = anchor;
                var target = map.GetComponentsInChildren<VulcanusMapAnchor>(true)
                    .SingleOrDefault(value => StringComparer.OrdinalIgnoreCase.Equals(value.AnchorId, id));
                if (!target) throw new InvalidOperationException($"Map '{map.MapId}' has no anchor '{anchor}'.");
                return target.transform.position;
            }
            if (x > (double)map.Width * map.TileSize || y > (double)map.Height * map.TileSize)
                throw new ArgumentOutOfRangeException(nameof(map), $"Position ({x}, {y}) is outside map '{map.MapId}'.");
            return map.transform.TransformPoint(new Vector3((float)(x / map.TileSize), (float)(map.Height - y / map.TileSize), 0));
        }
    }
}

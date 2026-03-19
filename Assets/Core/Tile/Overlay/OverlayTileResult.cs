using UnityEngine;
using UnityEngine.Tilemaps;

namespace Core.Tile.Overlay
{
    /// <summary>
    /// Result of an overlay evaluation for a single tile.
    /// Contains the tile to display and optional arbitrary data.
    /// </summary>
    public readonly struct OverlayTileResult
    {
        public Vector2Int Coordinates { get; }
        public TileBase Tile { get; }
        public OverlayData Data { get; }
        public bool ShouldShow => Tile != null;

        public OverlayTileResult(Vector2Int coordinates, TileBase tile, OverlayData data = default)
        {
            Coordinates = coordinates;
            Tile = tile;
            Data = data;
        }

        public static OverlayTileResult Hidden(Vector2Int coordinates) => new(coordinates, null);
    }

    /// <summary>
    /// Arbitrary data that can be attached to an overlay tile.
    /// Extend this struct or use the generic fields for custom data.
    /// </summary>
    public struct OverlayData
    {
        /// <summary>General-purpose float value (water level, progress, etc.)</summary>
        public float Value;
        
        /// <summary>General-purpose state (valid, invalid, warning, etc.)</summary>
        public int State;
        
        /// <summary>Optional color tint</summary>
        public Color? Tint;

        public static OverlayData Valid => new() { State = 1 };
        public static OverlayData Invalid => new() { State = -1 };
        public static OverlayData OutOfRange => new() { State = 0 };
    }
}

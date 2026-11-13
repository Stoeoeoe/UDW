using System;
using UnityEngine;

namespace Core.Tile.Vulcanus
{
    /// <summary>
    /// Baked per-cell navigation data of one map, in Unity cell coordinates (y is flipped from the Vulcanus rows):
    /// the cost of walking each cell (1..100; unauthored cells hold <see cref="DefaultCost"/>) and whether static
    /// collision blocks it, so routes can be planned without loading the map.
    /// </summary>
    [Serializable]
    public class NavigationCostGrid
    {
        public const int DefaultCost = 2;
        public const int MinCost = 1;
        public const int MaxCost = 100;

        [SerializeField] private int width;
        [SerializeField] private int height;
        [SerializeField] private byte[] costs;
        [SerializeField] private bool[] blocked;

        public int Width => width;
        public int Height => height;

        public NavigationCostGrid(int gridWidth, int gridHeight, byte[] cellCosts, bool[] blockedCells)
        {
            if (cellCosts == null || cellCosts.Length != gridWidth * gridHeight)
                throw new ArgumentException("Cost array must contain exactly width * height entries.", nameof(cellCosts));
            if (blockedCells == null || blockedCells.Length != gridWidth * gridHeight)
                throw new ArgumentException("Blocked array must contain exactly width * height entries.", nameof(blockedCells));
            width = gridWidth;
            height = gridHeight;
            costs = cellCosts;
            blocked = blockedCells;
        }

        public bool Contains(Vector2Int cell) => cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height;

        /// <summary>Whether static collision (tiles, drawn water, map collision shapes) covers the middle of the cell.</summary>
        public bool IsBlocked(Vector2Int cell)
        {
            if (!Contains(cell))
                throw new ArgumentOutOfRangeException(nameof(cell), $"Cell {cell} is outside the {width}x{height} navigation grid.");
            return blocked[cell.y * width + cell.x];
        }

        public int GetCost(Vector2Int cell)
        {
            if (!Contains(cell))
                throw new ArgumentOutOfRangeException(nameof(cell), $"Cell {cell} is outside the {width}x{height} navigation grid.");
            return costs[cell.y * width + cell.x];
        }
    }
}

using System;
using UnityEngine;

namespace Core.Tile.Vulcanus
{
    /// <summary>
    /// Baked per-cell navigation cost of one map, in Unity cell coordinates (y is flipped from the Vulcanus rows).
    /// Costs are 1..100; unauthored cells hold <see cref="DefaultCost"/>.
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

        public int Width => width;
        public int Height => height;

        public NavigationCostGrid(int gridWidth, int gridHeight, byte[] cellCosts)
        {
            if (cellCosts == null || cellCosts.Length != gridWidth * gridHeight)
                throw new ArgumentException("Cost array must contain exactly width * height entries.", nameof(cellCosts));
            width = gridWidth;
            height = gridHeight;
            costs = cellCosts;
        }

        public bool Contains(Vector2Int cell) => cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height;

        public int GetCost(Vector2Int cell)
        {
            if (!Contains(cell))
                throw new ArgumentOutOfRangeException(nameof(cell), $"Cell {cell} is outside the {width}x{height} navigation grid.");
            return costs[cell.y * width + cell.x];
        }
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;

namespace Character
{
    /// <summary>Weighted 8-directional A* on a cell grid. Scene-independent; the caller supplies the cell costs.</summary>
    public static class GridPathfinder
    {
        /// <summary>Returns false for a blocked cell, otherwise its traversal cost (at least 1).</summary>
        public delegate bool CellCost(Vector2Int cell, out int cost);

        private static readonly Vector2Int[] Directions =
        {
            new(1, 0), new(-1, 0), new(0, 1), new(0, -1),
            new(1, 1), new(1, -1), new(-1, 1), new(-1, -1)
        };

        /// <summary>
        /// Finds the cheapest route from <paramref name="start"/> to <paramref name="goal"/>. Entering a cell costs that
        /// cell's cost, times sqrt(2) for diagonal steps. A diagonal step needs both orthogonal neighbours walkable.
        /// The start cell is never checked or charged. <paramref name="waypoints"/> excludes the start, includes the goal,
        /// and merges straight runs into their end cells; it is empty when start equals goal.
        /// </summary>
        public static bool TryFindPath(Vector2Int start, Vector2Int goal, RectInt bounds, CellCost cellCost,
            out List<Vector2Int> waypoints, out float totalCost)
        {
            waypoints = new List<Vector2Int>();
            totalCost = 0f;
            if (start == goal) return true;
            if (!bounds.Contains(start) || !bounds.Contains(goal) || !cellCost(goal, out _)) return false;

            var cost = new Dictionary<Vector2Int, float> { [start] = 0f };
            var cameFrom = new Dictionary<Vector2Int, Vector2Int>();
            var closed = new HashSet<Vector2Int>();
            // (f, insertion order) is unique, so ties never compare cells.
            var open = new SortedSet<(float f, int order, int x, int y)>();
            var order = 0;
            open.Add((Heuristic(start, goal), order++, start.x, start.y));

            while (open.Count > 0)
            {
                var top = open.Min;
                open.Remove(top);
                var current = new Vector2Int(top.x, top.y);
                if (!closed.Add(current)) continue;
                if (current == goal)
                {
                    totalCost = cost[goal];
                    waypoints = BuildWaypoints(cameFrom, start, goal);
                    return true;
                }

                foreach (var direction in Directions)
                {
                    var next = current + direction;
                    if (!bounds.Contains(next) || closed.Contains(next) || !cellCost(next, out var stepCost)) continue;
                    var diagonal = direction.x != 0 && direction.y != 0;
                    if (diagonal && (!cellCost(new Vector2Int(current.x + direction.x, current.y), out _) ||
                                     !cellCost(new Vector2Int(current.x, current.y + direction.y), out _)))
                        continue;

                    var candidate = cost[current] + stepCost * (diagonal ? Mathf.Sqrt(2f) : 1f);
                    if (cost.TryGetValue(next, out var known) && known <= candidate) continue;
                    cost[next] = candidate;
                    cameFrom[next] = current;
                    open.Add((candidate + Heuristic(next, goal), order++, next.x, next.y));
                }
            }

            return false;
        }

        // Octile distance at the minimum possible cell cost of 1, so the result stays optimal.
        private static float Heuristic(Vector2Int from, Vector2Int to)
        {
            var dx = Mathf.Abs(from.x - to.x);
            var dy = Mathf.Abs(from.y - to.y);
            return Mathf.Abs(dx - dy) + Mathf.Sqrt(2f) * Mathf.Min(dx, dy);
        }

        private static List<Vector2Int> BuildWaypoints(Dictionary<Vector2Int, Vector2Int> cameFrom, Vector2Int start, Vector2Int goal)
        {
            var cells = new List<Vector2Int> { goal };
            for (var cell = goal; cameFrom[cell] != start; cell = cameFrom[cell]) cells.Add(cameFrom[cell]);
            cells.Add(start);
            cells.Reverse();

            var waypoints = new List<Vector2Int>();
            for (var i = 1; i < cells.Count; i++)
            {
                var isLast = i == cells.Count - 1;
                if (isLast || cells[i + 1] - cells[i] != cells[i] - cells[i - 1]) waypoints.Add(cells[i]);
            }
            return waypoints;
        }
    }
}

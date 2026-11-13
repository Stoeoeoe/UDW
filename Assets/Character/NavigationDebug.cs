#if UNITY_EDITOR
using System.Collections.Generic;
using UnityEngine;

namespace Character
{
    /// <summary>
    /// Editor-only hook through which navigation publishes its latest request for the debug view
    /// (Tools > Navigation > Show Navigation Debug). Gameplay code never reads it.
    /// </summary>
    public static class NavigationDebug
    {
        public sealed class Request
        {
            public Vector2Int Start;
            public Vector2Int Goal;
            public HashSet<Vector2Int> Blocked;
            public List<Vector2Int> Waypoints;
            public bool Found;
        }

        /// <summary>The most recent planning request, with the cells that were evaluated as blocked.</summary>
        public static Request Last { get; private set; }

        /// <summary>Routes that are currently walking.</summary>
        public static readonly List<NavigationRoute> ActiveRoutes = new();

        internal static void Publish(Vector2Int start, Vector2Int goal, Dictionary<Vector2Int, bool> evaluated,
            List<Vector2Int> waypoints, bool found)
        {
            var blocked = new HashSet<Vector2Int>();
            foreach (var pair in evaluated) if (pair.Value) blocked.Add(pair.Key);
            Last = new Request { Start = start, Goal = goal, Blocked = blocked, Waypoints = waypoints, Found = found };
        }

        internal static void Register(NavigationRoute route) => ActiveRoutes.Add(route);
        internal static void Unregister(NavigationRoute route) => ActiveRoutes.Remove(route);
    }
}
#endif

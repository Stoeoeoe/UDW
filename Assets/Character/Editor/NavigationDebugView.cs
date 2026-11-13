using Core.Tile;
using Core.Tile.Vulcanus;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Character.Editor
{
    /// <summary>
    /// Scene-view debug drawing for navigation: the baked cost grid of the current map (Edit and Play mode), the cells the last
    /// request treated as blocked, and active routes (Play mode). Toggle: Tools > Navigation > Show Navigation Debug.
    /// Draws through <see cref="SceneView.duringSceneGui"/>; nothing is added to scenes or prefabs.
    /// </summary>
    [InitializeOnLoad]
    public static class NavigationDebugView
    {
        private const string MenuPath = "Tools/Navigation/Show Navigation Debug";
        private const string PrefKey = "UrdewValley.NavigationDebug";
        private const int MaxLabelledCells = 1500;
        private static readonly Color Cheap = new(0.247f, 0.725f, 0.314f); // same meaning as the Vulcanus overlay
        private static readonly Color Expensive = new(0.973f, 0.318f, 0.286f);
        private static readonly Color Blocked = new(1f, 0.55f, 0f);

        static NavigationDebugView()
        {
            SceneView.duringSceneGui += Draw;
            EditorApplication.update += () => { if (Enabled && Application.isPlaying) SceneView.RepaintAll(); };
        }

        private static bool Enabled => EditorPrefs.GetBool(PrefKey, false);

        [MenuItem(MenuPath)]
        private static void Toggle()
        {
            EditorPrefs.SetBool(PrefKey, !Enabled);
            SceneView.RepaintAll();
        }

        [MenuItem(MenuPath, true)]
        private static bool ToggleValidate()
        {
            Menu.SetChecked(MenuPath, Enabled);
            return true;
        }

        private static VulcanusImportedMap FindMap()
        {
            if (Application.isPlaying)
            {
                var maps = Object.FindFirstObjectByType<MapManager>();
                return maps ? maps.CurrentMap : null;
            }
            var stage = PrefabStageUtility.GetCurrentPrefabStage();
            return stage ? stage.prefabContentsRoot.GetComponent<VulcanusImportedMap>()
                : Object.FindFirstObjectByType<VulcanusImportedMap>();
        }

        private static void Draw(SceneView view)
        {
            if (!Enabled || Event.current.type != EventType.Repaint) return;
            var map = FindMap();
            if (!map || !map.TerrainTilemap) return;

            var tilemap = map.TerrainTilemap;
            DrawCosts(view, map, tilemap);
            if (!Application.isPlaying) return;
            DrawLastRequest(tilemap);
            DrawRoutes();
        }

        private static void DrawCosts(SceneView view, VulcanusImportedMap map, UnityEngine.Tilemaps.Tilemap tilemap)
        {
            var grid = map.NavigationCosts;
            if (grid == null) return;

            // Only the cells inside the visible Scene-view rect are drawn, so large maps stay usable.
            var visible = VisibleWorldRect(view);
            var min = (Vector2Int)(Vector3Int)tilemap.WorldToCell(visible.min - MapManager.TileVisualOffset);
            var max = (Vector2Int)(Vector3Int)tilemap.WorldToCell(visible.max - MapManager.TileVisualOffset);
            min = Vector2Int.Max(min, Vector2Int.zero);
            max = Vector2Int.Min(max, new Vector2Int(grid.Width - 1, grid.Height - 1));
            var label = (max.x - min.x + 1) * (max.y - min.y + 1) <= MaxLabelledCells;

            for (var y = min.y; y <= max.y; y++)
            {
                for (var x = min.x; x <= max.x; x++)
                {
                    var cell = new Vector2Int(x, y);
                    var cost = grid.GetCost(cell);
                    var tint = Tint(cost);
                    if (tint.a > 0f) CellRect(tilemap, cell, tint, Color.clear);
                    if (label) Handles.Label(VisualCenter(tilemap, cell), cost.ToString());
                }
            }
        }

        private static Color Tint(int cost)
        {
            if (cost == NavigationCostGrid.DefaultCost) return Color.clear;
            if (cost < NavigationCostGrid.DefaultCost)
                return WithAlpha(Cheap, 0.25f + 0.25f * (NavigationCostGrid.DefaultCost - cost) /
                    (NavigationCostGrid.DefaultCost - NavigationCostGrid.MinCost));
            return WithAlpha(Expensive, 0.25f + 0.35f * Mathf.Min(1f, (cost - NavigationCostGrid.DefaultCost) / 8f));
        }

        private static Color WithAlpha(Color color, float alpha) => new(color.r, color.g, color.b, alpha);

        private static Rect VisibleWorldRect(SceneView view)
        {
            var camera = view.camera;
            var a = camera.ViewportToWorldPoint(new Vector3(0, 0, camera.nearClipPlane));
            var b = camera.ViewportToWorldPoint(new Vector3(1, 1, camera.nearClipPlane));
            return Rect.MinMaxRect(Mathf.Min(a.x, b.x), Mathf.Min(a.y, b.y), Mathf.Max(a.x, b.x), Mathf.Max(a.y, b.y));
        }

        /// <summary>Middle of the cell's drawn sprite, so overlays sit on the tiles the player sees.</summary>
        private static Vector3 VisualCenter(UnityEngine.Tilemaps.Tilemap tilemap, Vector2Int cell) =>
            tilemap.GetCellCenterWorld((Vector3Int)cell) + (Vector3)MapManager.TileVisualOffset;

        private static void CellRect(UnityEngine.Tilemaps.Tilemap tilemap, Vector2Int cell, Color fill, Color outline)
        {
            var center = VisualCenter(tilemap, cell);
            var half = tilemap.layoutGrid.cellSize * 0.5f;
            var corners = new[]
            {
                center + new Vector3(-half.x, -half.y), center + new Vector3(-half.x, half.y),
                center + new Vector3(half.x, half.y), center + new Vector3(half.x, -half.y)
            };
            Handles.DrawSolidRectangleWithOutline(corners, fill, outline);
        }

        private static void DrawLastRequest(UnityEngine.Tilemaps.Tilemap tilemap)
        {
            var request = NavigationDebug.Last;
            if (request == null) return;
            foreach (var cell in request.Blocked) CellRect(tilemap, cell, Color.clear, Blocked);
            if (request.Found) return;
            CellRect(tilemap, request.Start, new Color(1, 0, 0, 0.35f), Color.red);
            CellRect(tilemap, request.Goal, new Color(1, 0, 0, 0.35f), Color.red);
        }

        private static void DrawRoutes()
        {
            Handles.color = Color.cyan;
            foreach (var route in NavigationDebug.ActiveRoutes)
            {
                var points = new Vector3[route.Waypoints.Count];
                for (var i = 0; i < points.Length; i++) points[i] = route.Waypoints[i];
                if (points.Length > 1) Handles.DrawAAPolyLine(3f, points);
                if (points.Length > 0) Handles.DrawWireDisc(points[^1], Vector3.forward, 0.3f);
            }
        }
    }
}

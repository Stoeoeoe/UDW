using System.Collections.Generic;
using Core.Context;
using MoreMountains.Tools;
using UnityEngine;

namespace Core.Tile.Overlay
{
    /// <summary>
    /// Manages tile overlays. Attach overlays as children and assign the tilemap in inspector.
    /// </summary>
    public class TileOverlayManager : MMSingleton<TileOverlayManager>
    {
        [SerializeField] private int defaultRadius = 3;

        private readonly List<AbstractOverlay> _overlays = new();
        private readonly HashSet<Vector2Int> _activeTilePositions = new();
        private readonly Dictionary<Vector2Int, OverlayTileResult> _currentResults = new();
        
        private AbstractOverlay _activeOverlay;
        private PlayerInteractionContextSnapshot _lastSnapshot;

        public AbstractOverlay ActiveOverlay => _activeOverlay;

        protected override void Awake()
        {
            base.Awake();
            
            // Find all overlay components on children
            GetComponentsInChildren(_overlays);
        }

        private void Start()
        {
            if (PlayerInteractionContext.Current != null)
            {
                PlayerInteractionContext.Current.OnContextChanged += OnContextChanged;
            }
        }

        private void OnDestroy()
        {
            if (PlayerInteractionContext.Current != null)
            {
                PlayerInteractionContext.Current.OnContextChanged -= OnContextChanged;
            }
        }

        private void OnContextChanged(PlayerInteractionContextSnapshot snapshot)
        {
            _lastSnapshot = snapshot;
            UpdateOverlay(snapshot);
        }

        public void Refresh()
        {
            if (_lastSnapshot != null)
                UpdateOverlay(_lastSnapshot);
        }

        private void UpdateOverlay(PlayerInteractionContextSnapshot snapshot)
        {
            ClearOverlay();
            _currentResults.Clear();

            // Find first overlay that wants to show
            _activeOverlay = null;
            foreach (var overlay in _overlays)
            {
                if (overlay.ShouldShow(snapshot))
                {
                    _activeOverlay = overlay;
                    break;
                }
            }

            if (_activeOverlay == null)
                return;

            // Get tiles to evaluate
            var tilesToEvaluate = _activeOverlay.GetTilesToEvaluate(snapshot) 
                                  ?? GetDefaultTiles(snapshot);

            // Evaluate and display
            foreach (var result in _activeOverlay.Evaluate(tilesToEvaluate, snapshot))
            {
                if (result.ShouldShow)
                {
                    SetTile(result);
                    _currentResults[result.Coordinates] = result;
                }
            }
        }

        private IEnumerable<TileData> GetDefaultTiles(PlayerInteractionContextSnapshot snapshot)
        {
            var cursorTile = snapshot.CurrentTileDataUnderPointer;
            if (cursorTile == null)
                yield break;

            for (int dx = -defaultRadius; dx <= defaultRadius; dx++)
            {
                for (int dy = -defaultRadius; dy <= defaultRadius; dy++)
                {
                    var coords = new Vector2Int(cursorTile.Coordinates.x + dx, cursorTile.Coordinates.y + dy);
                    var tile = MapManager.Current.GetTileDataAtCoordinates(coords);
                    if (tile != null)
                        yield return tile;
                }
            }
        }

        private void SetTile(OverlayTileResult result)
        {
            var overlayTilemap = MapManager.Current.OverlayTilemap; 
            if (!overlayTilemap) return;

            var cellPos = new Vector3Int(result.Coordinates.x, result.Coordinates.y, 0);
            overlayTilemap.SetTile(cellPos, result.Tile);
            _activeTilePositions.Add(result.Coordinates);
        }

        private void ClearOverlay()
        {
            var overlayTilemap = MapManager.Current.OverlayTilemap; 
            if (!overlayTilemap) return;

            foreach (var pos in _activeTilePositions)
            {
                overlayTilemap.SetTile(new Vector3Int(pos.x, pos.y, 0), null);
            }
            _activeTilePositions.Clear();
        }

        public void Hide()
        {
            ClearOverlay();
            _activeOverlay = null;
            _currentResults.Clear();
        }

        /// <summary>
        /// Check if a tile is currently shown as valid in the overlay
        /// </summary>
        public bool IsTileValidInCurrentOverlay(Vector2Int coords)
        {
            return _currentResults.TryGetValue(coords, out var result) 
                   && result.Data.State > 0;
        }

        /// <summary>
        /// Get the overlay result for a specific tile, if any
        /// </summary>
        public OverlayTileResult? GetResultAt(Vector2Int coords)
        {
            return _currentResults.TryGetValue(coords, out var result) ? result : null;
        }
    }
}

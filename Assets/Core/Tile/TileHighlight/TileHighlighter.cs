using System.Collections.Generic;
using UnityEngine;

namespace Core.Tile.TileHighlight
{
    public class TileHighlighter : MonoBehaviour
    {
        [SerializeField] protected GameObject _tileHighlightPrefab;
        
        private List<GameObject> _highlights = new();
        private List<TileData> _tiles;

        private void Awake()
        {
            this.enabled = false;
        }

        private void OnDisable()
        {
            foreach (GameObject child in _highlights)
            {
                Destroy(child);
            }
        }

        public void SetTiles(List<TileData> tiles)
        {
            this._tiles = tiles;
            foreach (var tile in _tiles)
            {
                var highlight = Instantiate(_tileHighlightPrefab, this.transform, false);
                highlight.transform.position = tile.WorldPosition;
                // highlight.transform.localPosition = Vector3.zero;
                _highlights.Add(highlight);
            }
        }

        public void Hide()
        {
            this.enabled = false;
        }

        public void Show()
        {
            this.enabled = true;
        }
    }
}
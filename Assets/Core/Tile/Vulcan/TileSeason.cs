using System;
using Core.TimeAndWeather;
using UnityEngine;
using UnityEngine.Tilemaps;
using Object = UnityEngine.Object;

namespace Core.Tile.Vulcanus
{
    /// <summary>
    /// The season tiles and objects are drawn in, through season twin tilesets; null draws the base tilesets.
    /// <see cref="SeasonalTiles"/> keeps it in step with the game clock; the Scene view's season switch previews it.
    /// </summary>
    public static class TileSeason
    {
        public static Season? Current { get; private set; }

        /// <summary>Raised after <see cref="Current"/> changes.</summary>
        public static event Action Changed;

        public static void Set(Season? season)
        {
            if (Current == season) return;
            Current = season;
            // Tiles pick their season's sprite when a tilemap asks for their data again.
            foreach (var tilemap in Object.FindObjectsByType<Tilemap>(FindObjectsInactive.Include)) tilemap.RefreshAllTiles();
            Changed?.Invoke();
        }
    }
}

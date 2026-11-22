using System;
using Core.TimeAndWeather;

namespace Core.Tile.Vulcanus
{
    /// <summary>
    /// The season tiles and objects are drawn in, through season twin tilesets; null draws the base tilesets.
    /// <see cref="SeasonalTiles"/> keeps it in step with the game clock.
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
            Changed?.Invoke();
        }
    }
}

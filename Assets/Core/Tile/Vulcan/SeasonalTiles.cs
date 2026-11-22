using System;
using Core.TimeAndWeather;
using UnityEngine;
using UnityEngine.Tilemaps;
using VContainer.Unity;
using Object = UnityEngine.Object;

namespace Core.Tile.Vulcanus
{
    /// <summary>Draws tiles and objects in the clock's season, and the base tilesets again when the game ends.</summary>
    public sealed class SeasonalTiles : IStartable, IDisposable
    {
        private readonly GameClock _clock;

        public SeasonalTiles(GameClock clock) => _clock = clock;

        public void Start()
        {
            _clock.ConditionsRefreshed += OnConditionsRefreshed;
            if (_clock.CurrentSeason) Show(_clock.CurrentSeason.season);
        }

        public void Dispose()
        {
            _clock.ConditionsRefreshed -= OnConditionsRefreshed;
            Show(null);
        }

        private static void OnConditionsRefreshed(SeasonData season, float dayProgress) => Show(season.season);

        private static void Show(Season? season)
        {
            if (TileSeason.Current == season) return;
            TileSeason.Set(season);
            // Tiles pick their season's sprite when a tilemap asks for their data again.
            foreach (var tilemap in Object.FindObjectsByType<Tilemap>(FindObjectsInactive.Include)) tilemap.RefreshAllTiles();
        }
    }
}

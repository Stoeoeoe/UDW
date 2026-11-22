using System;
using Core.TimeAndWeather;
using VContainer.Unity;

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
            if (_clock.CurrentSeason) TileSeason.Set(_clock.CurrentSeason.season);
        }

        public void Dispose()
        {
            _clock.ConditionsRefreshed -= OnConditionsRefreshed;
            TileSeason.Set(null);
        }

        private static void OnConditionsRefreshed(SeasonData season, float dayProgress) => TileSeason.Set(season.season);
    }
}

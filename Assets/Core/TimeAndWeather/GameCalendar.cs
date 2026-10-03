using System;
using Core.Game;

namespace Core.TimeAndWeather
{
    /// <summary>Calendar rules shared by day progression and saved cooldown deadlines.</summary>
    public sealed class GameCalendar
    {
        private readonly int _startOfDay;
        private readonly int _daysPerSeason;
        private readonly Season[] _seasons;

        public GameCalendar(int startOfDay, int daysPerSeason, params Season[] seasons)
        {
            _startOfDay = startOfDay;
            _daysPerSeason = daysPerSeason;
            _seasons = (Season[])seasons.Clone();
        }

        public Season GetNextSeason(Season current) =>
            _seasons[(GetSeasonIndex(current) + 1) % _seasons.Length];

        /// <summary>Always returns a future boundary, including on the first day of a season or year.</summary>
        public long GetNextBoundaryMinute(GameTimeState time, GameTimeBoundary boundary)
        {
            var daysUntil = boundary switch
            {
                GameTimeBoundary.NextDay => 1,
                GameTimeBoundary.NextSeason => _daysPerSeason - time.dayOfSeason + 1,
                GameTimeBoundary.NextYear => _daysPerSeason - time.dayOfSeason + 1 +
                    (_seasons.Length - GetSeasonIndex(time.season) - 1) * _daysPerSeason,
                _ => throw new ArgumentOutOfRangeException(nameof(boundary))
            };
            return ((long)time.daysSinceStart + daysUntil - 1) * 24 * 60 + _startOfDay * 60;
        }

        private int GetSeasonIndex(Season season)
        {
            var index = Array.IndexOf(_seasons, season);
            return index >= 0 ? index : throw new InvalidOperationException($"Season '{season}' is not in the calendar.");
        }
    }
}

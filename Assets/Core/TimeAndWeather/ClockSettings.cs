using System;
using System.Linq;
using UnityEngine;

namespace Core.TimeAndWeather
{
    /// <summary>Authored calendar rules, serialized on the single SystemRoot and injected into the game clock.</summary>
    [Serializable]
    public sealed class ClockSettings
    {
        public Season startingSeason = Season.Spring;
        public int startingDay = 5;
        public int startOfDay = 6;
        public int endOfDay = 23;
        public int numberOfDaysInSeason = 14;
        /// <summary>
        /// Real seconds per step of the clock; each step advances it <see cref="MinutesPerStep"/> minutes, so this is
        /// not the length of one minute (see <see cref="SecondsPerMinute"/>).
        /// </summary>
        public float secondsPerInGameMinute = 10f; // TODO: Probably wrong? Seems too fast
        [Tooltip("Seasons in calendar order.")] public SeasonData[] seasons = Array.Empty<SeasonData>();

        /// <summary>The clock shows and advances whole steps of this many minutes.</summary>
        public const int MinutesPerStep = 10;

        /// <summary>Real seconds one in-game minute lasts on average.</summary>
        public float SecondsPerMinute => secondsPerInGameMinute / MinutesPerStep;

        public void Validate()
        {
            if (seasons == null || seasons.Length == 0 || seasons.Any(season => !season))
                throw new InvalidOperationException("Clock settings require every season in calendar order.");
            if (seasons.Select(season => season.season).Distinct().Count() != seasons.Length)
                throw new InvalidOperationException("Clock settings contain a season more than once.");
            if (seasons.All(season => season.season != startingSeason))
                throw new InvalidOperationException($"Starting season '{startingSeason}' has no season data.");
            if (startOfDay < 0 || endOfDay > 24 || startOfDay >= endOfDay)
                throw new InvalidOperationException("The playable day must start before it ends, within 0-24 hours.");
            if (numberOfDaysInSeason < 1 || startingDay < 1 || startingDay > numberOfDaysInSeason)
                throw new InvalidOperationException("Clock settings require a starting day within a non-empty season.");
            if (secondsPerInGameMinute <= 0f)
                throw new InvalidOperationException("Clock settings require a positive clock speed.");
        }
    }
}

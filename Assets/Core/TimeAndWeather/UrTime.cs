using System;

namespace Core.TimeAndWeather
{
    [Serializable]
    public class UrTime : IEquatable<UrTime>
    {
        public int DayOfSeason { get; private set; }

        public int Hour { get; private set; }
        public int Minute { get; private set; }
        public Season Season { get; private set; }

        public UrTime(Season season, int dayOfSeason, int hour, int minute)
        {
            DayOfSeason = dayOfSeason;
            Hour = hour;
            Minute = minute;
            Season = season;
        }

        public bool Equals(UrTime other) => other != null &&
            Season == other.Season && DayOfSeason == other.DayOfSeason &&
            Hour == other.Hour && Minute == other.Minute;

        public override bool Equals(object obj) => obj is UrTime other && Equals(other);

        public override int GetHashCode() => HashCode.Combine(Season, DayOfSeason, Hour, Minute);

        public override string ToString()
        {
            return $"{Season} - {DayOfSeason}:{Hour}:{Minute}";
        }
    }
}

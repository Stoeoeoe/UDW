using System;

namespace Core.TimeAndWeather
{
    [Serializable]
    public class UrTime
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

        public override string ToString()
        {
            return $"{Season} - {DayOfSeason}:{Hour}:{Minute}";
        }
    }
}
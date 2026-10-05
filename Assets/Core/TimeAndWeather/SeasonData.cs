using UnityEngine;
using Util;

namespace Core.TimeAndWeather
{
    [CreateAssetMenu(fileName = "Season Data", menuName = "Game/Time/Season")]
    public class SeasonData : ScriptableObject
    {
        public string label;
        public Season season;
        public Gradient daylightColorGradient;
        public WeightedList<WeatherData> weatherData;
    }
}

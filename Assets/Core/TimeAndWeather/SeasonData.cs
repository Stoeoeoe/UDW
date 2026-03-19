using UnityEngine;
using Util;

namespace Core.TimeAndWeather
{
    [CreateAssetMenu(fileName = "SeasonData", menuName = "Game/SeasonData")]
    public class SeasonData : ScriptableObject
    {
        public string label;
        public int index;
        public Season season;
        public Gradient daylightColorGradient;
        public WeightedList<WeatherData> weatherData;
    }
}
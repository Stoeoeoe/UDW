using MoreMountains.Tools;

namespace Core.TimeAndWeather
{
    public struct WeatherUpdateEvent
    {
        public WeatherData WeatherData;

        static WeatherUpdateEvent e;
        public static void Trigger(WeatherData weatherData)
        {
            e.WeatherData = weatherData;
            MMEventManager.TriggerEvent(e);
        }
    }
}
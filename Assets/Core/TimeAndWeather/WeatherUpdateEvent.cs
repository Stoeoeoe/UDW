using Core.Events;

namespace Core.TimeAndWeather
{
    public struct WeatherUpdateEvent
    {
        public WeatherData WeatherData;

        public static void Trigger(WeatherData weatherData)
            => EventBus<WeatherUpdateEvent>.Raise(new WeatherUpdateEvent { WeatherData = weatherData });
    }
}
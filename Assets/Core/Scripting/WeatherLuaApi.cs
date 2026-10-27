using System;
using Core.Catalogs;
using Core.TimeAndWeather;
using UnityEngine.Scripting;

namespace Core.Scripting
{
    [LuaModule("Weather")]
    public sealed class WeatherLuaApi
    {
        private readonly WeatherManager _manager;
        private readonly WeatherCatalog _weather;

        public WeatherLuaApi(WeatherManager manager, WeatherCatalog weather)
        {
            _manager = manager ? manager : throw new InvalidOperationException("Weather actions require the initialized WeatherManager.");
            _weather = weather ? weather : throw new InvalidOperationException("The required WeatherCatalog is missing.");
        }

        internal static WeatherLuaApi BindCurrentWeather() => new(WeatherManager.Instance,
            CatalogResources.Load<WeatherCatalog>(WeatherCatalog.ResourceName));

        private WeatherData RequireWeather(string weather)
        {
            var definition = _weather.Get(weather);
            if (!definition) throw new InvalidOperationException($"Weather '{weather}' is not registered and enabled.");
            definition.RequireValidConfiguration();
            return definition;
        }

        [Preserve] public void ValidateWeather(string weather) => RequireWeather(weather);

        [LuaAction("weather.setWeather", "Set weather", "Weather", "Change weather until the next seasonal roll, without advancing the calendar.",
            "cutscene", Validator = nameof(ValidateWeather), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        public void SetWeather([LuaResource("weather")] string weather) => _manager.SetWeather(RequireWeather(weather));
    }
}

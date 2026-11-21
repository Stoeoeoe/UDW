using Core.Catalogs;
using System;
using Core.TimeAndWeather;
using UnityEngine.Scripting;

namespace Core.Scripting
{
    [LuaModule("Weather")]
    public sealed class WeatherLuaApi
    {
        private readonly WeatherManager _manager;
        private readonly DefinitionCatalog _weather;

        public WeatherLuaApi(WeatherManager manager, DefinitionCatalog weather)
        {
            _manager = manager ? manager : throw new InvalidOperationException("Weather actions require the initialized WeatherManager.");
            _weather = weather ? weather : throw new InvalidOperationException("The required DefinitionCatalog is missing.");
        }

        private WeatherData RequireWeather(string weather)
        {
            var definition = _weather.Get<WeatherData>(weather);
            if (!definition) throw new InvalidOperationException($"Weather '{weather}' is not registered and enabled.");
            definition.RequireValidConfiguration();
            return definition;
        }

        [Preserve] public void ValidateWeather(string weather) => RequireWeather(weather);

        /// <summary>Whether the weather now is this one. Throws for a weather that is not registered and enabled.</summary>
        [LuaCall, Preserve]
        public bool Is([LuaResource("weather")] string weather) =>
            _manager.CurrentWeather == (_weather.Get<WeatherData>(weather) ?? throw new InvalidOperationException($"Weather '{weather}' is not registered and enabled."));

        [LuaAction("weather.setWeather", "Set weather", "Weather", "Change weather until the next seasonal roll, without advancing the calendar.",
            "cutscene", Validator = nameof(ValidateWeather), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        public void SetWeather([LuaResource("weather")] string weather) => _manager.SetWeather(RequireWeather(weather));
    }
}

using Core.Catalogs;
using UnityEngine;

namespace Core.TimeAndWeather
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Weather")]
    [DefaultCatalog(WeatherCatalog.ResourceName)]
    [Core.Scripting.LuaResource("weather", DescriptionMember = nameof(WeatherData.label))]
    public sealed class WeatherCatalog : DefinitionCatalog<WeatherData>
    {
        public const string ResourceName = "WeatherCatalog";
        public override string Path => "Assets";
        protected override string GetDefinitionId(WeatherData definition) => definition.id;
    }
}

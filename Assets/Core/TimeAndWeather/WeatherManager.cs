using System.Collections;
using MoreMountains.Feedbacks;
using MoreMountains.Tools;
using UnityEngine;
using UnityEngine.Rendering;

namespace Core.TimeAndWeather
{
    /// <summary>Selects seasonal weather and owns its effects, post-processing and daylight presentation.</summary>
    public sealed class WeatherManager : Singleton<WeatherManager>
    {
        [SerializeField] private VolumeProfile defaultVolumeProfile;
        [SerializeField] private Volume postProcessingVolume;

        /// <summary>The active weather, available once the calendar has initialized.</summary>
        public WeatherData CurrentWeather { get; private set; }

        private Transform _effectsRoot;
        private int _weatherUpdateVersion;

        protected override void OnAwake()
        {
            if (!postProcessingVolume || !defaultVolumeProfile)
                throw new System.InvalidOperationException("WeatherManager requires a volume and default profile.");
            _effectsRoot = new GameObject("Weather").transform;
            _effectsRoot.SetParent(transform, false);
        }

        /// <summary>Rolls the current season's weather at startup, after load and before daily simulation updates.</summary>
        internal void RefreshConditions()
        {
            SetWeather(UrTimeManager.Instance.CurrentSeason.weatherData.GetRandomItem());
            RefreshDaylight();
        }

        /// <summary>Changes weather until the next seasonal roll, without advancing the calendar.</summary>
        public void SetWeather(WeatherData weather)
        {
            if (!weather) throw new System.ArgumentNullException(nameof(weather));
            if (!_effectsRoot || !isActiveAndEnabled)
                throw new System.InvalidOperationException("The weather manager is not initialized and active.");
            StartCoroutine(ApplyWeather(weather));
        }

        private IEnumerator ApplyWeather(WeatherData weather)
        {
            var version = ++_weatherUpdateVersion;
            CurrentWeather = weather;
            postProcessingVolume.profile = weather.postProcessingProfile ? weather.postProcessingProfile : defaultVolumeProfile;
            _effectsRoot.MMDestroyAllChildren();

            if (weather.weatherEffectPrefab)
            {
                var effects = Instantiate(weather.weatherEffectPrefab, _effectsRoot);
                var feedbacks = effects.GetComponent<MMF_Player>();
                if (feedbacks) feedbacks.AutoPlayOnStart = true;
            }

            // Renderer features need a frame to become ready. A newer request owns any eventual notification.
            yield return null;
            if (version != _weatherUpdateVersion) yield break;
            RefreshDaylight();
            WeatherUpdateEvent.Trigger(weather);
        }

        /// <summary>Samples the active weather override or the current season's daylight gradient.</summary>
        internal void RefreshDaylight()
        {
            var clock = UrTimeManager.Instance;
            var gradient = CurrentWeather.overrideDaylightColor
                ? CurrentWeather.daylightColorGradient : clock.CurrentSeason.daylightColorGradient;
            DayLightUpdateEvent.Trigger(gradient.Evaluate(clock.DayProgress));
        }

        private void OnDisable()
        {
            ++_weatherUpdateVersion;
            StopAllCoroutines();
        }
    }
}

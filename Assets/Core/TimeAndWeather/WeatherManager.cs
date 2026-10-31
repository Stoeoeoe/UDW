using System.Collections;
using Core.Common;
using Core.Location;
using Core.Tile.Water;
using MoreMountains.Feedbacks;
using MoreMountains.Tools;
using UnityEngine;
using UnityEngine.Rendering;

namespace Core.TimeAndWeather
{
    /// <summary>Selects seasonal weather and owns its effects, post-processing and daylight presentation.</summary>
    // Bind the initial location before UrTimeManager.Start rolls its first weather.
    [DefaultExecutionOrder(-800)]
    public sealed class WeatherManager : Singleton<WeatherManager>, ILocationLifecycle
    {
        [SerializeField] private VolumeProfile defaultVolumeProfile;
        [SerializeField] private Volume postProcessingVolume;

        /// <summary>The active weather, available once the calendar has initialized.</summary>
        public WeatherData CurrentWeather { get; private set; }

        private Transform _effectsRoot;
        private int _weatherUpdateVersion;
        private LocationData _location;
        private AudioSource _ambience;
        private AudioLowPassFilter _ambienceLowPass;
        private MMSoundManager _ambienceManager;
        private static readonly int IndoorWeatherCover = Shader.PropertyToID("_IndoorWeatherCover");
        private bool IsIndoor => _location && _location.locationType == LocationType.Indoor;

        protected override void OnAwake()
        {
            if (!postProcessingVolume || !defaultVolumeProfile)
                throw new System.InvalidOperationException("WeatherManager requires a volume and default profile.");
            _effectsRoot = new GameObject("Weather").transform;
            _effectsRoot.SetParent(transform, false);
        }

        private void Start() => LevelManager.Instance.RegisterLifecycle(this);
        private void OnEnable() => LevelManager.Instance?.RegisterLifecycle(this);

        public void OnLocationEnter(LocationData location)
        {
            _location = location;
            RefreshPresentation();
            if (CurrentWeather) RefreshDaylight();
        }

        public void OnLocationLeave(LocationData location) { }

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
            weather.RequireValidConfiguration();
            if (!_effectsRoot || !isActiveAndEnabled)
                throw new System.InvalidOperationException("The weather manager is not initialized and active.");
            StartCoroutine(ApplyWeather(weather));
        }

        private IEnumerator ApplyWeather(WeatherData weather)
        {
            var version = ++_weatherUpdateVersion;
            CurrentWeather = weather;
            postProcessingVolume.profile = weather.postProcessingProfile ? weather.postProcessingProfile : defaultVolumeProfile;
            RefreshPresentation();

            // Renderer features need a frame to become ready. A newer request owns any eventual notification.
            yield return null;
            if (version != _weatherUpdateVersion) yield break;
            RefreshDaylight();
            WeatherUpdateEvent.Trigger(weather);
        }

        private void RefreshPresentation()
        {
            Shader.SetGlobalFloat(IndoorWeatherCover, IsIndoor ? 1f : 0f);
            if (!CurrentWeather) return; // The location may enter before the calendar's first weather roll.
            WaterInteraction.Rain = IsIndoor ? 0f : CurrentWeather.waterRainIntensity;
            StopEffects();
            _effectsRoot.MMDestroyAllChildren();
            if (!IsIndoor && CurrentWeather.weatherEffectPrefab)
            {
                var effects = Instantiate(CurrentWeather.weatherEffectPrefab, _effectsRoot);
                var feedbacks = effects.GetComponent<MMF_Player>();
                if (feedbacks) feedbacks.AutoPlayOnStart = true;
            }

            var clip = _location && _location.muteWeatherAudio ? null
                : IsIndoor ? CurrentWeather.indoorAmbience : CurrentWeather.outdoorAmbience;
            if (_ambience && _ambience.clip == clip)
            {
                ApplyAmbienceSettings();
                return;
            }
            StopAmbience();
            if (!clip) return;
            _ambienceManager = MMSoundManager.Current;
            if (!_ambienceManager)
                throw new System.InvalidOperationException("Weather ambience requires the initialized MMSoundManager.");
            var options = MMSoundManagerPlayOptions.Default;
            options.MmSoundManagerTrack = MMSoundManager.MMSoundManagerTracks.Sfx;
            options.Loop = true;
            options.Persistent = true;
            options.SpatialBlend = 0;
            options.Volume = CurrentWeather.ambienceVolume;
            _ambience = _ambienceManager.PlaySound(clip, options);
            _ambienceLowPass = _ambience.GetComponent<AudioLowPassFilter>();
            ApplyAmbienceSettings();
        }

        private void ApplyAmbienceSettings()
        {
            _ambience.volume = CurrentWeather.ambienceVolume * (IsIndoor ? CurrentWeather.indoorAmbienceVolumeMultiplier : 1f);
            var filtered = IsIndoor && CurrentWeather.indoorAmbienceLowPass;
            if (filtered)
            {
                if (!_ambienceLowPass) _ambienceLowPass = _ambience.gameObject.AddComponent<AudioLowPassFilter>();
                _ambienceLowPass.cutoffFrequency = CurrentWeather.indoorAmbienceCutoffFrequency;
                _ambienceLowPass.lowpassResonanceQ = 1f;
            }
            if (_ambienceLowPass) _ambienceLowPass.enabled = filtered;
        }

        private void StopEffects()
        {
            foreach (var feedbacks in _effectsRoot.GetComponentsInChildren<MMF_Player>())
                feedbacks.StopFeedbacks();
        }

        private void StopAmbience()
        {
            // Sources return to the shared sound pool: other sounds must not inherit weather filtering.
            if (_ambienceLowPass) _ambienceLowPass.enabled = false;
            _ambienceLowPass = null;
            if (_ambience) _ambienceManager.FreeSound(_ambience);
            _ambience = null;
            _ambienceManager = null;
        }

        /// <summary>Samples the active weather override or the current season's daylight gradient.</summary>
        internal void RefreshDaylight()
        {
            var clock = UrTimeManager.Instance;
            var gradient = IsIndoor ? CurrentWeather.indoorDaylightColorGradient : CurrentWeather.overrideDaylightColor
                ? CurrentWeather.daylightColorGradient : clock.CurrentSeason.daylightColorGradient;
            DayLightUpdateEvent.Trigger(gradient.Evaluate(clock.DayProgress));
        }

        private void OnDisable()
        {
            ++_weatherUpdateVersion;
            StopAllCoroutines();
            LevelManager.Instance?.UnregisterLifecycle(this);
            StopAmbience();
            if (_effectsRoot) StopEffects();
            Shader.SetGlobalFloat(IndoorWeatherCover, 0);
            WaterInteraction.Rain = 0;
        }
    }
}

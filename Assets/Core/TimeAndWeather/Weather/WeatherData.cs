using System.Collections.Generic;
using Core.Common;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Core.TimeAndWeather
{
    [CreateAssetMenu(fileName = "WeatherEffect", menuName = "Game/Weather Effect")]
    public class WeatherData : ValidatedScriptableObject
    {
        public string id;
        public string label;
        public GameObject weatherEffectPrefab;
        [Header("Weather ambience")]
        public AudioClip outdoorAmbience;
        public AudioClip indoorAmbience;
        [Range(0, 1)] public float ambienceVolume = 1f;
        [Tooltip("Multiplies ambience volume indoors. Assign the same clip to both ambience slots to keep the loop running across room transitions.")]
        [Range(0, 1)] public float indoorAmbienceVolumeMultiplier = 1f;
        public bool indoorAmbienceLowPass;
        [EnableIf(nameof(indoorAmbienceLowPass)), Range(10, 22000)]
        public float indoorAmbienceCutoffFrequency = 1500f;
        public LocationFilter locationFilter;
        public bool playMusic = false;
        [EnableIf("playMusic")]
        public AudioClip weatherMusic;
        public VolumeProfile postProcessingProfile;
        
        public bool overrideDaylightColor = false;
        [EnableIf("overrideDaylightColor")]
        public Gradient daylightColorGradient;

        [Tooltip("Indoor light color over the playable day, independent of the outdoor daylight ramp. White keeps the room fully lit.")]
        public Gradient indoorDaylightColorGradient = new()
        {
            colorKeys = new[] { new GradientColorKey(Color.white, 0), new GradientColorKey(Color.white, 1) }
        };
        
        public ScriptableRendererFeature weatherRendererFeature;
        public Material weatherMaterial;

        [Range(0, 1), Tooltip("Water-surface rain splash density. Zero for dry weather or snow.")]
        public float waterRainIntensity;
        [Range(0, 1), Tooltip("How rough the sea is: more continuous, thicker swell crests, whitecaps and a wider surf. Zero is calm.")]
        public float waterSeaState;

        public override IReadOnlyList<ConfigurationError> ValidateConfiguration()
        {
            var errors = new List<ConfigurationError>();
            if (!float.IsFinite(ambienceVolume) || ambienceVolume < 0 || ambienceVolume > 1)
                errors.Add(new ConfigurationError(this, nameof(ambienceVolume), "Ambience volume must be finite and in [0,1]."));
            if (!float.IsFinite(indoorAmbienceVolumeMultiplier) || indoorAmbienceVolumeMultiplier < 0 || indoorAmbienceVolumeMultiplier > 1)
                errors.Add(new ConfigurationError(this, nameof(indoorAmbienceVolumeMultiplier), "Indoor ambience volume multiplier must be finite and in [0,1]."));
            if (!float.IsFinite(indoorAmbienceCutoffFrequency) || indoorAmbienceCutoffFrequency < 10 || indoorAmbienceCutoffFrequency > 22000)
                errors.Add(new ConfigurationError(this, nameof(indoorAmbienceCutoffFrequency), "Indoor ambience cutoff frequency must be finite and in [10,22000] Hz."));
            if (!float.IsFinite(waterRainIntensity) || waterRainIntensity < 0 || waterRainIntensity > 1)
                errors.Add(new ConfigurationError(this, nameof(waterRainIntensity), "Rain splash intensity must be finite and in [0,1]."));
            return errors.AsReadOnly();
        }
    }
}

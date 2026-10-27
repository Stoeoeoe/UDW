using Core.Common;
using System.Collections.Generic;
using Sirenix.OdinInspector;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.Serialization;

namespace Core.TimeAndWeather
{
    [CreateAssetMenu(fileName = "WeatherEffect", menuName = "Game/Weather Effect")]
    public class WeatherData : ValidatedScriptableObject
    {
        public string id;
        public string label;
        public GameObject weatherEffectPrefab;
        public LocationFilter locationFilter;
        public bool playMusic = false;
        [EnableIf("playMusic")]
        public AudioClip weatherMusic;
        public VolumeProfile postProcessingProfile;
        
        public bool overrideDaylightColor = false;
        [EnableIf("overrideDaylightColor")]
        public Gradient daylightColorGradient;
        
        public ScriptableRendererFeature weatherRendererFeature;
        public Material weatherMaterial;

        [Range(0, 1), Tooltip("Water-surface rain splash density. Zero for dry weather or snow.")]
        public float waterRainIntensity;

        public override IReadOnlyList<ConfigurationError> ValidateConfiguration()
        {
            var errors = new List<ConfigurationError>();
            if (!float.IsFinite(waterRainIntensity) || waterRainIntensity < 0 || waterRainIntensity > 1)
                errors.Add(new ConfigurationError(this, nameof(waterRainIntensity), "Rain splash intensity must be finite and in [0,1]."));
            return errors.AsReadOnly();
        }
    }
}

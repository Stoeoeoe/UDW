using Core.Common;
using Sirenix.OdinInspector;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.Serialization;

namespace Core.TimeAndWeather
{
    [CreateAssetMenu(fileName = "WeatherEffect", menuName = "Game/Weather Effect")]
    public class WeatherData : ScriptableObject
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
    }
}
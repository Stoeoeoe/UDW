using UnityEngine;

namespace Core.TimeAndWeather
{
    /// <summary>Publishes one coherent world wind field for Pixel Wind Sprite materials.</summary>
    /// <remarks>
    /// Placeholder for the wind proof of concept: the values are hand-tuned fields on a scene object.
    /// It still needs proper integration, such as being driven by <see cref="WeatherManager"/> and
    /// sharing its wind direction with the rain and snow effects.
    /// </remarks>
    [ExecuteAlways]
    [DisallowMultipleComponent]
    public sealed class PixelWindDriver : MonoBehaviour
    {
        private static readonly int PixelWind = Shader.PropertyToID("_PixelWind");
        private static readonly int PixelWindWave = Shader.PropertyToID("_PixelWindWave");
        private static readonly int PixelWindExtra = Shader.PropertyToID("_PixelWindExtra");

        [Header("Wind force (art pixels)")]
        [Tooltip("Resting lean in art pixels. Negative leans left.")]
        public float leanPixels = 0.15f;

        [Min(0f), Tooltip("Additional tip displacement at the peak of a gust, in art pixels.")]
        public float gustPixels = 1.35f;

        [Range(-1f, 1f), Tooltip("Direction plants bend: -1 left, +1 right. Independent of gust-front travel direction.")]
        public float bendDirection = 1f;

        [Min(0f), Tooltip("Slow, subtle per-plant movement between gusts (mostly visible with subpixel sway).")]
        public float tremblePixels = 0.18f;

        [Header("Gust fronts")]
        [Range(0f, 0.95f), Tooltip("Higher = calmer weather with less frequent gust peaks.")]
        public float gustThreshold = 0.43f;

        [Min(0f), Tooltip("How fast gust fronts move through the world, in world units per second.")]
        public float gustSpeed = 0.85f;

        [Min(0.5f), Tooltip("Approximate distance between large gust changes, in world units.")]
        public float gustWavelength = 9f;

        [Range(0f, 360f), Tooltip("Direction the gust fronts travel (0 = east), not the direction plants bend.")]
        public float gustDirection = 0f;

        [Range(0f, 1f), Tooltip("0 = coherent local gusts; 1 = moderately different timing/strength per plant.")]
        public float plantSpread = 0.2f;

        [Header("Animation")]
        [Min(0f), Tooltip("0 = continuous simulation. Otherwise sample wind this many times per second.")]
        public float stepsPerSecond = 0f;

        private void OnEnable() => Publish();
        private void OnValidate() => Publish();
        private void Update() => Publish();

        private void OnDisable()
        {
            Shader.SetGlobalVector(PixelWind, Vector4.zero);
            Shader.SetGlobalVector(PixelWindWave, Vector4.zero);
            Shader.SetGlobalVector(PixelWindExtra, new Vector4(1f, 0f, 1f, 0f));
        }

        private void Publish()
        {
            float radians = gustDirection * Mathf.Deg2Rad;

            // Preserve the original global names/layout; new bendDirection uses Extra.z.
            Shader.SetGlobalVector(PixelWind, new Vector4(
                leanPixels, gustPixels, gustSpeed, stepsPerSecond));
            Shader.SetGlobalVector(PixelWindWave, new Vector4(
                Mathf.Cos(radians), Mathf.Sin(radians), gustWavelength, plantSpread));
            Shader.SetGlobalVector(PixelWindExtra, new Vector4(
                gustThreshold, tremblePixels, bendDirection, 0f));
        }
    }
}

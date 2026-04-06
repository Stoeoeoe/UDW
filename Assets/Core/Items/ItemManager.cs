using Core;
using UnityEngine;
using UnityEngine.Audio;

namespace Core.Items
{
    /// <summary>
    /// Global configuration for world items: magnet behaviour and default pickup sound.
    /// Lives on SystemRoot (persistent across scenes).
    /// </summary>
    public class ItemManager : Singleton<ItemManager>
    {
        [Header("Magnet")]
        [SerializeField] private float magnetRadius = 2.5f;
        [SerializeField] private float pickupRadius = 0.25f;
        [SerializeField] private float maxSpeed     = 12f;
        [Tooltip("Speed multiplier over normalized approach distance. X=0 is just entering range, X=1 is at pickup radius.")]
        [SerializeField] private AnimationCurve magnetCurve = AnimationCurve.EaseInOut(0f, 0.1f, 1f, 1f);

        [Header("Fade")]
        [Tooltip("Item begins fading to transparent when closer than this distance to the player.")]
        [SerializeField] private float fadeStartDistance = 0.6f;
        [SerializeField] private float fadeDuration      = 0.15f;

        [Header("Default Pickup Sound")]
        [SerializeField] private AudioClip       defaultPickupSound;
        [SerializeField] private AudioMixerGroup audioMixerGroup;
        [SerializeField] private float           volume   = 1f;
        [SerializeField] [Range(0f, 2f)] private float pitchMin = 0.9f;
        [SerializeField] [Range(0f, 2f)] private float pitchMax = 1.1f;

        public float          MagnetRadius      => magnetRadius;
        public float          PickupRadius      => pickupRadius;
        public float          MaxSpeed          => maxSpeed;
        public float          FadeStartDistance => fadeStartDistance;
        public float          FadeDuration      => fadeDuration;
        public AnimationCurve MagnetCurve       => magnetCurve;

        /// <summary>
        /// Samples the magnet curve to get a speed value for the current distance.
        /// </summary>
        /// <param name="dist">Current distance from target.</param>
        public float EvaluateSpeed(float dist)
        {
            // t=0 when just entering magnetRadius, t=1 when at pickupRadius
            float range = magnetRadius - pickupRadius;
            float t     = range > 0f ? 1f - Mathf.Clamp01((dist - pickupRadius) / range) : 1f;
            return maxSpeed * magnetCurve.Evaluate(t);
        }

        /// <summary>
        /// Plays the pickup sound for an item. Uses the item's own clip if set, otherwise falls back to the default.
        /// </summary>
        public void PlayPickupSound(AudioClip overrideClip = null)
        {
            var clip = overrideClip ? overrideClip : defaultPickupSound;
            if (!clip) return;

            float pitch = Random.Range(pitchMin, pitchMax);
            MoreMountains.Tools.MMSfxEvent.Trigger(clip, audioMixerGroup, volume, pitch);
        }
    }
}

using System;
using UnityEngine;
using UnityEngine.Audio;

namespace Core.Items
{
    [Serializable]
    public sealed class ItemSettings
    {
        [Header("Magnet")]
        public float magnetRadius = 2.5f;
        public float pickupRadius = 0.25f;
        public float maxSpeed = 12f;
        public AnimationCurve magnetCurve = AnimationCurve.EaseInOut(0f, 0.1f, 1f, 1f);
        [Header("Fade")]
        public float fadeStartDistance = 0.6f;
        public float fadeDuration = 0.15f;
        [Header("Default pickup sound")]
        public AudioClip defaultPickupSound;
        public AudioMixerGroup audioMixerGroup;
        public float volume = 1f;
        [Range(0f, 2f)] public float pitchMin = 0.9f;
        [Range(0f, 2f)] public float pitchMax = 1.1f;
        [Header("Dropping")]
        public WorldItem droppedItemPrefab;
        public Vector2 dropOffset = new(0f, -1f);
        [Min(0f)] public float dropPickupDelay = 2f;

        public void Validate()
        {
            if (!droppedItemPrefab)
                throw new InvalidOperationException("Item settings require a dropped-item prefab.");
        }

        public void RequirePickupSound(AudioClip overrideClip)
        {
            if (!overrideClip && !defaultPickupSound)
                throw new InvalidOperationException("Forage pickups require an item pickup sound or the configured default pickup sound.");
        }
    }
}

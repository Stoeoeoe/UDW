using System;
using System.Collections.Generic;
using Core.Common;
using UnityEngine;

namespace Character.Animations
{
    /// <summary>A base animation with occasional weighted one-shot variations, separated by a random delay.</summary>
    [CreateAssetMenu(menuName = "Game/Character/Animation Set")]
    public sealed class CharacterAnimationSet : CharacterAnimationDefinition
    {
        /// <summary>Selection weight belongs to this set, so the same animation can have different frequencies elsewhere.</summary>
        [Serializable]
        public sealed class Variation
        {
            [SerializeField, Validation.ValidReference]
            private CharacterAnimation animation;
            [SerializeField, Validation.Finite, Validation.Min(float.Epsilon)]
            private float weight = 1f;

            public CharacterAnimation Animation => animation;
            public float Weight => weight;
        }

        [SerializeField, Validation.ValidReference]
        private CharacterAnimation baseAnimation;
        [Tooltip("Scaled seconds spent in the base animation before choosing a variation.")]
        [SerializeField]
        private Vector2 variationDelay = new(5f, 10f);
        [SerializeField, Validation.Required, Validation.RequiredElements, Validation.Nested]
        private Variation[] variations = Array.Empty<Variation>();

        public override CharacterAnimation BaseAnimation => baseAnimation;
        public Vector2 VariationDelay => variationDelay;
        public IReadOnlyList<Variation> Variations => variations;

        /// <summary>Selects from a nonempty, validated set using a sample in [0, 1], including Unity Random.value's upper endpoint.</summary>
        public CharacterAnimation SelectVariation(float sample)
        {
            double total = 0;
            foreach (var variation in variations) total += variation.Weight;
            var remaining = sample * total;
            for (var i = 0; i < variations.Length - 1; i++)
            {
                remaining -= variations[i].Weight;
                if (remaining < 0) return variations[i].Animation;
            }
            return variations[^1].Animation;
        }
    }
}

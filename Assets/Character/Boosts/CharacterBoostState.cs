using System;
using System.Collections.Generic;
using UnityEngine;

namespace Character
{
    /// <summary>Saved boost sources and their applied values, independent of authored assets.</summary>
    [Serializable]
    public sealed class CharacterBoostState
    {
        [SerializeField]
        public Dictionary<string, ActiveAttributeBoost> Active = new(StringComparer.Ordinal);
    }

    /// <summary>A snapshot of one source's bonuses and absolute in-game expiration time.</summary>
    [Serializable]
    public sealed class ActiveAttributeBoost
    {
        public long ExpiresAtMinute;
        public AppliedAttributeBonus[] Bonuses;

        internal void Apply(CharacterAttributes attributes, string source)
        {
            for (var i = 0; i < Bonuses.Length; i++)
            {
                var bonus = Bonuses[i];
                attributes.SetModifier(bonus.Attribute, $"boost:{source}:{i}", bonus.Flat, bonus.Percent);
            }
        }

        internal void Remove(CharacterAttributes attributes, string source)
        {
            for (var i = 0; i < Bonuses.Length; i++)
                attributes.RemoveModifier(Bonuses[i].Attribute, $"boost:{source}:{i}");
        }
    }

    /// <summary>Persisted modifier values; no definition lookup is needed when restoring a boost.</summary>
    [Serializable]
    public struct AppliedAttributeBonus
    {
        public CharacterAttributeType Attribute;
        public float Flat;
        public float Percent;
    }
}

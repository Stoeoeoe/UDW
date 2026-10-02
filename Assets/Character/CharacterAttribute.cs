using System;
using System.Collections.Generic;
using UnityEngine;

namespace Character
{
    public enum CharacterAttributeType
    {
        MaxHealth,
        MaxStamina,
        WalkSpeed,
        RunSpeed,
        PhysicalDefense
    }

    /// <summary>An authored base value plus replaceable bonuses from skills, boons, or equipment.</summary>
    [Serializable]
    public sealed class CharacterAttribute
    {
        [SerializeField, Min(0f)] private float baseValue;

        [NonSerialized] private Dictionary<string, Modifier> _modifiers;

        public float BaseValue => baseValue;

        // Percentage bonuses add together, then apply after flat bonuses.
        // TODO: Consider adding a cache if the modifier count rises.
        public float Value
        {
            get
            {
                float flat = 0f;
                float percent = 0f;
                if (_modifiers != null)
                    foreach (var modifier in _modifiers.Values)
                    {
                        flat += modifier.Flat;
                        percent += modifier.Percent;
                    }

                return Mathf.Max(0f, (baseValue + flat) * (1f + percent));
            }
        }

        public CharacterAttribute(float baseValue)
        {
            this.baseValue = baseValue;
        }

        /// <summary>Replaces this source's bonus, so reapplying a boon cannot stack it twice.</summary>
        public void SetModifier(string sourceId, float flat = 0f, float percent = 0f)
        {
            if (string.IsNullOrWhiteSpace(sourceId))
                throw new ArgumentException("A modifier source ID is required.", nameof(sourceId));
            if (float.IsNaN(flat) || float.IsInfinity(flat) ||
                float.IsNaN(percent) || float.IsInfinity(percent))
                throw new ArgumentOutOfRangeException(nameof(flat), "Modifier values must be finite.");

            _modifiers ??= new Dictionary<string, Modifier>(StringComparer.Ordinal);
            _modifiers[sourceId] = new Modifier(flat, percent);
        }

        public bool RemoveModifier(string sourceId) => _modifiers != null && _modifiers.Remove(sourceId);

        private readonly struct Modifier
        {
            public readonly float Flat;
            public readonly float Percent;

            public Modifier(float flat, float percent)
            {
                Flat = flat;
                Percent = percent;
            }
        }
    }
}

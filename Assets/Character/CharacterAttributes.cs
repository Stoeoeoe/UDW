using System;
using UnityEngine;

namespace Character
{
    /// <summary>Authored base attributes and runtime modifiers from skills, equipment and boons.</summary>
    [Serializable]
    public sealed class CharacterAttributes
    {
        [SerializeField] private CharacterAttribute maxHealth = new(100f);
        [SerializeField] private CharacterAttribute maxStamina = new(100f);
        [SerializeField] private CharacterAttribute physicalDefense = new(0f);
        [SerializeField, Tooltip("Replaced on Awake by the character definition's walk speed, which Vulcanus authors.")]
        private CharacterAttribute walkSpeed = new(CharacterDefinition.DefaultWalkSpeed);
        [SerializeField] private CharacterAttribute runSpeed = new(7f);

        public int MaxHealth => Mathf.RoundToInt(maxHealth.Value);
        public int MaxStamina => Mathf.RoundToInt(maxStamina.Value);
        public int PhysicalDefense => Mathf.RoundToInt(physicalDefense.Value);
        public float WalkSpeed => walkSpeed.Value;
        public float RunSpeed => runSpeed.Value;
        public event Action MaximumStaminaChanged;
        public event Action MaximumHealthChanged;

        public void SetModifier(CharacterAttributeType type, string sourceId, float flat = 0f, float percent = 0f)
        {
            var previous = MaxStamina;
            var previousHealth = MaxHealth;
            Get(type).SetModifier(sourceId, flat, percent);
            ValidateMaximumHealth();
            if (MaxHealth != previousHealth) MaximumHealthChanged?.Invoke();
            if (MaxStamina != previous) MaximumStaminaChanged?.Invoke();
        }

        /// <summary>Uses the walk speed (tiles per second) authored on the character's definition.</summary>
        public void UseWalkSpeed(float tilesPerSecond) => walkSpeed.SetBaseValue(tilesPerSecond);

        public bool RemoveModifier(CharacterAttributeType type, string sourceId)
        {
            var previous = MaxStamina;
            var previousHealth = MaxHealth;
            var removed = Get(type).RemoveModifier(sourceId);
            ValidateMaximumHealth();
            if (MaxHealth != previousHealth) MaximumHealthChanged?.Invoke();
            if (MaxStamina != previous) MaximumStaminaChanged?.Invoke();
            return removed;
        }

        private CharacterAttribute Get(CharacterAttributeType type) => type switch
        {
            CharacterAttributeType.MaxHealth => maxHealth,
            CharacterAttributeType.MaxStamina => maxStamina,
            CharacterAttributeType.PhysicalDefense => physicalDefense,
            CharacterAttributeType.WalkSpeed => walkSpeed,
            CharacterAttributeType.RunSpeed => runSpeed,
            _ => throw new ArgumentOutOfRangeException(nameof(type))
        };

        public void ValidateConfiguration()
        {
            foreach (CharacterAttributeType type in Enum.GetValues(typeof(CharacterAttributeType)))
            {
                var attribute = Get(type);
                if (attribute == null || float.IsNaN(attribute.BaseValue) || float.IsInfinity(attribute.BaseValue) || attribute.BaseValue < 0)
                    throw new InvalidOperationException($"Character attribute {type} requires a finite, nonnegative base value.");
            }
            ValidateMaximumHealth();
        }

        private void ValidateMaximumHealth()
        {
            if (MaxHealth <= 0) throw new InvalidOperationException("Characters require a positive maximum health.");
        }
    }
}

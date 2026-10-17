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
        [SerializeField] private CharacterAttribute walkSpeed = new(4f);
        [SerializeField] private CharacterAttribute runSpeed = new(7f);

        public int MaxHealth => Mathf.RoundToInt(maxHealth.Value);
        public int MaxStamina => Mathf.RoundToInt(maxStamina.Value);
        public int PhysicalDefense => Mathf.RoundToInt(physicalDefense.Value);
        public float WalkSpeed => walkSpeed.Value;
        public float RunSpeed => runSpeed.Value;
        public event Action MaximumStaminaChanged;

        public void SetModifier(CharacterAttributeType type, string sourceId, float flat = 0f, float percent = 0f)
        {
            var previous = MaxStamina;
            Get(type).SetModifier(sourceId, flat, percent);
            if (MaxStamina != previous) MaximumStaminaChanged?.Invoke();
        }

        public bool RemoveModifier(CharacterAttributeType type, string sourceId)
        {
            var previous = MaxStamina;
            var removed = Get(type).RemoveModifier(sourceId);
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
        }
    }
}

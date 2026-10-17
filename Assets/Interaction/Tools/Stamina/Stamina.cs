using System;
using Character;
using UnityEngine;

namespace Interaction.Tools.Stamina
{
    /// <summary>
    /// Tracks character stamina. Raises StaminaChangedEvent whenever the value changes so UI can react.
    /// </summary>
    public class Stamina : MonoBehaviour
    {
        [field: SerializeField] public int StartStamina { get; private set; }
        private GameCharacter _character;
        private CharacterAttributes _attributes;

        public int MaxStamina => _attributes.MaxStamina;

        public int CurrentStamina { get; private set; }

        public void Bind(GameCharacter character, CharacterAttributes attributes)
        {
            if (!character) throw new ArgumentNullException(nameof(character));
            if (attributes == null) throw new ArgumentNullException(nameof(attributes));
            if (_attributes != null) _attributes.MaximumStaminaChanged -= RefreshMaximum;
            _character = character;
            _attributes = attributes;
            _attributes.MaximumStaminaChanged += RefreshMaximum;
        }

        private void OnDestroy() => Unbind();

        public void Unbind()
        {
            if (_attributes != null) _attributes.MaximumStaminaChanged -= RefreshMaximum;
            _attributes = null;
        }

        public void RefreshMaximum()
        {
            CurrentStamina = Mathf.Min(CurrentStamina, MaxStamina);
            StaminaChangedEvent.Trigger(_character, CurrentStamina, MaxStamina);
        }

        public void ConsumeStamina(int amount)
        {
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
            CurrentStamina = Mathf.Clamp(CurrentStamina - amount, 0, MaxStamina);
            StaminaChangedEvent.Trigger(_character, CurrentStamina, MaxStamina);
            if (CurrentStamina <= 0)
                StaminaDepletedEvent.Trigger();
        }

        public void RestoreStamina(int amount)
        {
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
            CurrentStamina = Mathf.Min(CurrentStamina + amount, MaxStamina);
            StaminaChangedEvent.Trigger(_character, CurrentStamina, MaxStamina);
        }

        public void Initialize(int startStamina)
        {
            StartStamina = startStamina;
            CurrentStamina = Mathf.Clamp(StartStamina, 0, MaxStamina);
            StaminaChangedEvent.Trigger(_character, CurrentStamina, MaxStamina);
        }
    }
}

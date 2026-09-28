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

        public int MaxStamina => _character != null ? _character.MaxStamina : 0;

        public int CurrentStamina { get; private set; }

        private void Awake() => _character = GetComponentInParent<GameCharacter>();

        public void RefreshMaximum()
        {
            CurrentStamina = Mathf.Min(CurrentStamina, MaxStamina);
            StaminaChangedEvent.Trigger(CurrentStamina, MaxStamina);
        }

        public void ConsumeStamina(int amount)
        {
            CurrentStamina = Mathf.Clamp(CurrentStamina - amount, 0, MaxStamina);
            StaminaChangedEvent.Trigger(CurrentStamina, MaxStamina);
            if (CurrentStamina <= 0)
                StaminaDepletedEvent.Trigger();
        }

        public void RestoreStamina(int amount)
        {
            CurrentStamina = Mathf.Min(CurrentStamina + amount, MaxStamina);
            StaminaChangedEvent.Trigger(CurrentStamina, MaxStamina);
        }

        public void Initialize(int startStamina)
        {
            StartStamina = startStamina;
            CurrentStamina = Mathf.Clamp(StartStamina, 0, MaxStamina);
            StaminaChangedEvent.Trigger(CurrentStamina, MaxStamina);
        }
    }
}

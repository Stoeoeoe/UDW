using UnityEngine;

namespace Interaction.Tools.Stamina
{
    /// <summary>
    /// Tracks character stamina. Raises StaminaChangedEvent whenever the value changes so UI can react.
    /// </summary>
    public class Stamina : MonoBehaviour
    {
        [field: SerializeField] public int StartStamina { get; private set; }
        [field: SerializeField] public int MaxStamina { get; private set; }

        public int CurrentStamina { get; private set; }

        public void SetMaxStamina(int maxStamina) => MaxStamina = maxStamina;

        public void ConsumeStamina(int amount)
        {
            CurrentStamina = Mathf.Max(CurrentStamina - amount, 0);
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
            CurrentStamina = StartStamina;
            StaminaChangedEvent.Trigger(CurrentStamina, MaxStamina);
        }
    }
}
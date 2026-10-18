using System;
using Character;
using UnityEngine;

namespace Interaction.Tools.Stamina
{
    /// <summary>Owns current stamina, consumption and restoration against the character's maximum stamina attribute.</summary>
    [DisallowMultipleComponent]
    public sealed class Stamina : MonoBehaviour
    {
        [SerializeField, Min(0)] private int startingStamina = 100;
        private GameCharacter _character;
        private CharacterAttributes _attributes;
        private StaminaState _state;

        public int StartStamina => startingStamina;
        public int MaxStamina => _attributes.MaxStamina;
        public int CurrentStamina => _state.Current;

        internal void Bind(GameCharacter character)
        {
            _character = character;
            _attributes = character.Attributes;
        }

        /// <summary>Binds live saved or runtime-local stamina after attributes are ready, seeding the configured amount once.</summary>
        public void Initialize(StaminaState state)
        {
            _state = state;
            if (!state.Initialized)
            {
                state.Current = startingStamina;
                state.Initialized = true;
            }
            state.Current = Math.Min(state.Current, MaxStamina);
            _attributes.MaximumStaminaChanged -= RefreshMaximum;
            _attributes.MaximumStaminaChanged += RefreshMaximum;
            Publish();
        }

        /// <summary>Consumes up to the available stamina and returns the amount spent. Only reaching zero publishes depletion.</summary>
        public int ConsumeStamina(int amount)
        {
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
            var spent = Math.Min(amount, CurrentStamina);
            if (spent == 0) return 0;
            _state.Current -= spent;
            Publish();
            if (CurrentStamina == 0) StaminaDepletedEvent.Trigger(_character);
            return spent;
        }

        /// <summary>Restores up to the current maximum and returns the amount restored, including recovery from zero.</summary>
        public int RestoreStamina(int amount)
        {
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
            var restored = Math.Min(amount, MaxStamina - CurrentStamina);
            if (restored == 0) return 0;
            _state.Current += restored;
            Publish();
            return restored;
        }

        /// <summary>Restores stamina to the current maximum.</summary>
        public int RestoreToFull() => RestoreStamina(MaxStamina);

        private void RefreshMaximum()
        {
            _state.Current = Math.Min(CurrentStamina, MaxStamina);
            Publish();
        }

        private void Publish() => StaminaChangedEvent.Trigger(_character, CurrentStamina, MaxStamina);

        internal void Unbind()
        {
            // An inactive prefab instance may be destroyed before binding.
            if (_attributes != null) _attributes.MaximumStaminaChanged -= RefreshMaximum;
            _attributes = null;
        }

        private void OnDestroy() => Unbind();
    }
}

using System;
using UnityEngine;

namespace Character
{
    /// <summary>Owns current health, damage and healing. Zero health enters the character's existing death flow.</summary>
    [DisallowMultipleComponent]
    public sealed class CharacterHealth : MonoBehaviour
    {
        private GameCharacter _character;
        private CharacterAttributes _attributes;
        private HealthState _state;

        public int CurrentHealth => _state.Current;
        public int MaxHealth => _attributes.MaxHealth;
        public bool IsDead => CurrentHealth == 0;

        internal void Bind(GameCharacter character)
        {
            _character = character;
            _attributes = character.Attributes;
        }

        /// <summary>Binds live saved or runtime-local health after attributes are ready. Rebinding never refills existing health.</summary>
        public void Initialize(HealthState state)
        {
            _state = state;
            if (!state.Initialized)
            {
                state.Current = MaxHealth;
                state.Initialized = true;
            }
            // A loaded character's equipment or bonuses may now give it a smaller maximum.
            state.Current = Math.Min(state.Current, MaxHealth);
            _attributes.MaximumHealthChanged -= RefreshMaximum;
            _attributes.MaximumHealthChanged += RefreshMaximum;
            if (IsDead) _character.SetConditionState(ConditionState.Dead);
            Publish();
        }

        /// <summary>Applies health loss and returns the actual amount lost. Damage to an already dead character does nothing.</summary>
        public int TakeDamage(int amount)
        {
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
            var lost = Math.Min(amount, CurrentHealth);
            if (lost == 0) return 0;
            _state.Current -= lost;
            if (IsDead) _character.SetConditionState(ConditionState.Dead);
            Publish();
            return lost;
        }

        /// <summary>Heals up to the current maximum and returns the amount restored. Healing cannot revive the dead.</summary>
        public int Heal(int amount)
        {
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
            if (IsDead) return 0;
            var restored = Math.Min(amount, MaxHealth - CurrentHealth);
            if (restored == 0) return 0;
            _state.Current += restored;
            Publish();
            return restored;
        }

        /// <summary>Fully heals a living character; does not revive a dead one.</summary>
        public int RestoreToFull() => Heal(MaxHealth);

        private void RefreshMaximum()
        {
            _state.Current = Math.Min(CurrentHealth, MaxHealth);
            Publish();
        }

        private void Publish() => HealthChangedEvent.Trigger(_character, CurrentHealth, MaxHealth);

        internal void Unbind()
        {
            // An inactive prefab instance may be destroyed before the character has bound it.
            if (_attributes != null) _attributes.MaximumHealthChanged -= RefreshMaximum;
        }

        private void OnDestroy() => Unbind();
    }
}

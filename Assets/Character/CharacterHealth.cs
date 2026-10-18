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

        public int CurrentHealth => _state.Current + _state.Overcharge;
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
            ReconcileMaximum();
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
            var surplusLost = Math.Min(lost, _state.Overcharge);
            _state.Overcharge -= surplusLost;
            _state.Current -= lost - surplusLost;
            if (IsDead) _character.SetConditionState(ConditionState.Dead);
            Publish();
            return lost;
        }

        /// <summary>Heals up to the current maximum and returns the amount restored. Healing cannot revive the dead.</summary>
        public int Heal(int amount)
        {
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
            if (IsDead) return 0;
            var restored = Math.Min(amount, Math.Max(0, MaxHealth - CurrentHealth));
            if (restored == 0) return 0;
            _state.Current += restored;
            Publish();
            return restored;
        }

        /// <summary>Fully heals a living character; does not revive a dead one.</summary>
        public int RestoreToFull() => Heal(MaxHealth);

        /// <summary>Adds health beyond the normal cap when full. Surplus is spent first and cannot be healed back; does not revive.</summary>
        public int GrantOvercharge(int amount)
        {
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
            if (IsDead || amount == 0) return 0;
            var total = checked(CurrentHealth + amount);
            _state.Current = Math.Min(total, MaxHealth);
            _state.Overcharge = total - _state.Current;
            Publish();
            return amount;
        }

        private void RefreshMaximum()
        {
            ReconcileMaximum();
            Publish();
        }

        private void ReconcileMaximum()
        {
            // Capacity loss still caps normal health. Capacity gained absorbs existing surplus without granting points.
            _state.Current = Math.Min(_state.Current, MaxHealth);
            var absorbed = Math.Min(_state.Overcharge, MaxHealth - _state.Current);
            _state.Current += absorbed;
            _state.Overcharge -= absorbed;
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

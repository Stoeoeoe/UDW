using System;
using Core.Events;

namespace Character
{
    /// <summary>Character-owned wallet. Bind the player's saved state before gameplay starts.</summary>
    public sealed class Wallet
    {
        private readonly GameCharacter _character;
        private WalletState _state = new();

        public Wallet(GameCharacter character = null) => _character = character;

        public int Balance => _state.Balance;

        internal void Bind(WalletState state)
        {
            var previous = Balance;
            _state = state ?? throw new ArgumentNullException(nameof(state));
            Notify(previous);
        }

        /// <summary>Adds rewards up to the cap. Returns the amount actually credited.</summary>
        public int Add(int amount)
        {
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
            var previous = Balance;
            _state.SetBalance((long)previous + amount);
            var credited = Balance - previous;
            Notify(previous);
            return credited;
        }

        /// <summary>All-or-nothing credit, suitable for sales which must not lose proceeds at the cap.</summary>
        public bool TryAdd(int amount)
        {
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
            if (amount > WalletState.MaximumBalance - Balance) return false;
            Add(amount);
            return true;
        }

        /// <summary>All-or-nothing payment. Insufficient funds leave the wallet unchanged.</summary>
        public bool TrySpend(int amount)
        {
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
            var previous = Balance;
            if (amount > previous) return false;
            _state.SetBalance(previous - amount);
            Notify(previous);
            return true;
        }

        private void Notify(int previous)
        {
            var current = Balance;
            if (previous == current) return;
            EventBus<WalletChangedEvent>.Raise(new WalletChangedEvent
            {
                Wallet = this, Character = _character, Previous = previous, Current = current
            });
        }
    }
}

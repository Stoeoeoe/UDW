using System;
using Sirenix.Serialization;

namespace Character
{
    /// <summary>Saved balance; the character component handles mutations and notifications.</summary>
    [Serializable]
    public sealed class WalletState
    {
        public const int MaximumBalance = 9_999_999;

        [OdinSerialize] private int _balance;
        public int Balance => _balance;

        internal void SetBalance(long balance) =>
            _balance = (int)Math.Max(0, Math.Min(MaximumBalance, balance));
    }
}

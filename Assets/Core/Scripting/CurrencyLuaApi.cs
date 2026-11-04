using System;
using VContainer;

namespace Core.Scripting
{
    [LuaModule("Wallet")]
    public class CurrencyLuaApi
    {
        [Inject] private CharacterManager _characters;

        [LuaCall(true)]
        [Preserve]
        public bool AddMoney(double money)
        {
            // TODO: Check if rounding is ok?
            return _characters.MainCharacter.Wallet.TryAdd((int)money);
        }

        [LuaCall(true)]
        [Preserve]
        public bool RemoveMoney(double money)
        {
            // TODO: Check if rounding is ok?
            return _characters.MainCharacter.Wallet.TrySpend((int)money);
        }

        [Preserve]
        public void ValidateAmount(double amount)
        {
            bool isValid = amount is >= 0.0 and <= int.MaxValue;
            if (!isValid)
            {
                throw new InvalidOperationException($"Amount ${amount} is out of range");
            }
        }
    }
}
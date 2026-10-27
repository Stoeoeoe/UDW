using System;
using Character;
using UnityEngine.Scripting;

namespace Core.Scripting
{
    [LuaModule("Wallet")]
    public class CurrencyLuaApi
    {
        [LuaCall(true)]
        [Preserve]
        public bool AddMoney(double money)
        {
            // TODO: Check if rounding is ok?
            return MainCharacter.CurrentMainCharacter.Wallet.TryAdd((int)money);
        }

        [LuaCall(true)]
        [Preserve]
        public bool RemoveMoney(double money)
        {
            // TODO: Check if rounding is ok?
            return MainCharacter.CurrentMainCharacter.Wallet.TrySpend((int)money);
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
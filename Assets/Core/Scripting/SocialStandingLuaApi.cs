using System;
using Core.SocialStanding;
using VContainer;

namespace Core.Scripting
{
    /// <summary>Reads and changes social standing, 0 to 100, with a character, a village or any namespaced subject ID.</summary>
    [LuaModule("SocialStanding")]
    public sealed class SocialStandingLuaApi
    {
        [Inject] private SocialStandingService _standing;

        [LuaCall, Preserve]
        public int Get(string subjectId) => _standing.Get(subjectId);

        [LuaCall, Preserve]
        public bool HasMoreThan(string subjectId, double standing) => _standing.HasMoreThan(subjectId, standing);

        [LuaCall, Preserve]
        public bool HasLessThan(string subjectId, double standing) => _standing.HasLessThan(subjectId, standing);

        /// <summary>Raises the standing by a whole number, capped at 100. Returns the new standing.</summary>
        [LuaCall(writesState: true), Preserve]
        public int Increase(string subjectId, double amount) => _standing.Increase(subjectId, WholeAmount(amount));

        /// <summary>Lowers the standing by a whole number, capped at 0. Returns the new standing.</summary>
        [LuaCall(writesState: true), Preserve]
        public int Decrease(string subjectId, double amount) => _standing.Decrease(subjectId, WholeAmount(amount));

        private static int WholeAmount(double amount)
        {
            if (!double.IsFinite(amount) || amount != Math.Truncate(amount) || amount < 0 || amount > int.MaxValue)
                throw new ArgumentOutOfRangeException(nameof(amount), "The amount must be a whole, non-negative number.");
            return (int)amount;
        }
    }
}

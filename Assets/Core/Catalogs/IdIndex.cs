using System;
using System.Collections.Generic;

namespace Core.Catalogs
{
    /// <summary>Indexes specialized bindings without imposing a catalog layout or discovery policy.</summary>
    public static class IdIndex
    {
        /// <summary>Skips missing IDs and keeps the first binding, using the caller's comparison rules.</summary>
        public static Dictionary<string, T> FirstWins<T>(IEnumerable<T> values, Func<T, string> getId,
            IEqualityComparer<string> comparer)
        {
            var result = new Dictionary<string, T>(comparer);
            if (values == null) return result;
            foreach (var value in values)
            {
                var id = getId(value);
                if (!string.IsNullOrWhiteSpace(id)) result.TryAdd(id, value);
            }
            return result;
        }
    }
}

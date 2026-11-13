using System;
using System.Collections.Generic;

namespace Util
{
    public static class MathUtils
    {
        /// <summary>
        /// Picks one item with a chance proportional to its weight. The sample in [0, 1] decides which: pass
        /// <c>UnityEngine.Random.value</c> for a random pick (1 is included and picks the last item), or a fixed
        /// sample to get the same pick every time.
        /// </summary>
        /// <remarks>Weights must be positive; callers validate them where they are authored.</remarks>
        public static T PickWeighted<T>(IReadOnlyList<T> items, Func<T, float> weight, double sample)
        {
            if (items == null || items.Count == 0) throw new ArgumentException("Pick from at least one item.", nameof(items));
            if (double.IsNaN(sample) || sample < 0 || sample > 1) throw new ArgumentOutOfRangeException(nameof(sample));
            double total = 0;
            foreach (var item in items) total += weight(item);
            var remaining = sample * total;
            for (var i = 0; i < items.Count - 1; i++)
            {
                remaining -= weight(items[i]);
                if (remaining < 0) return items[i];
            }
            return items[^1];
        }
    }
}

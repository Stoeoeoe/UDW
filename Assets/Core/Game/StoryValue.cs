using System;
using System.Collections.Generic;
using Sirenix.Serialization;

namespace Core.Game
{
    /// <summary>Saved plain data: booleans, strings, longs, finite doubles and string-keyed dictionaries.</summary>
    [Serializable]
    public sealed class StoryValue
    {
        [OdinSerialize] private object _value;

        public StoryValue(object value) => _value = Copy(value, new HashSet<object>());

        // Never expose a mutable dictionary from the live save root.
        public object GetSnapshot() => Copy(_value, new HashSet<object>());
        internal Type ValueType => _value.GetType();
        internal void Validate() => GetSnapshot();

        public T Get<T>()
        {
            var value = GetSnapshot();
            if (value is T result) return result;
            // Lua numbers are doubles. Permit only exact numeric conversions at the C# boundary.
            if (typeof(T) == typeof(long) && value is double number &&
                number == Math.Truncate(number) && number >= long.MinValue && number < 9223372036854775808d)
                return (T)(object)(long)number;
            if (typeof(T) == typeof(double) && value is long integer &&
                integer >= -9007199254740991L && integer <= 9007199254740991L)
                return (T)(object)(double)integer;
            throw new InvalidOperationException($"Story value contains {value.GetType().Name}, not {typeof(T).Name}.");
        }

        internal static bool SameType(StoryValue first, StoryValue second) =>
            first.ValueType == second.ValueType || (IsNumber(first.ValueType) && IsNumber(second.ValueType));

        private static bool IsNumber(Type type) => type == typeof(long) || type == typeof(double);

        private static object Copy(object value, HashSet<object> parents)
        {
            switch (value)
            {
                case bool or string or long: return value;
                case int integer: return (long)integer;
                case double number when double.IsFinite(number): return number;
                case IDictionary<string, object> dictionary:
                    if (!parents.Add(dictionary)) throw new ArgumentException("Story dictionaries cannot contain cycles.");
                    var copy = new Dictionary<string, object>(StringComparer.Ordinal);
                    foreach (var pair in dictionary)
                    {
                        RequireKey(pair.Key);
                        copy.Add(pair.Key, Copy(pair.Value, parents));
                    }
                    parents.Remove(dictionary);
                    return copy;
                default:
                    throw new ArgumentException("Story values must be booleans, strings, longs, finite doubles or string-keyed dictionaries; null is not a value.");
            }
        }

        internal static void RequireKey(string key)
        {
            if (string.IsNullOrWhiteSpace(key)) throw new ArgumentException("Story keys must be nonempty.", nameof(key));
        }
    }
}

using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using UnityEngine;

namespace Character
{
    /// <summary>Cardinal direction IDs shared by scripted facing and its editor resource choices.</summary>
    public static class CardinalDirections
    {
        public static IReadOnlyDictionary<string, Vector2> Values { get; } =
            new ReadOnlyDictionary<string, Vector2>(new Dictionary<string, Vector2>(StringComparer.Ordinal)
            {
                ["North"] = Vector2.up,
                ["East"] = Vector2.right,
                ["South"] = Vector2.down,
                ["West"] = Vector2.left
            });

        public static Vector2 Resolve(string direction) => Values.TryGetValue(direction, out var vector)
            ? vector : throw new ArgumentException($"Unknown direction '{direction}'. Expected North, East, South or West.", nameof(direction));
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;

namespace Core.Divinity
{
    /// <summary>Built-in deities live in Resources/Deities; mods can register definitions at runtime.</summary>
    public static class DeityDefinitions
    {
        private static Dictionary<string, DeityDefinition> _byId;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void Reset() => _byId = null;

        public static DeityDefinition Get(string id)
        {
            EnsureLoaded();
            if (_byId.TryGetValue(id, out var deity)) return deity;
            throw new InvalidOperationException($"No deity definition registered for '{id}'.");
        }

        public static bool TryGet(string id, out DeityDefinition deity)
        {
            EnsureLoaded();
            return _byId.TryGetValue(id, out deity);
        }

        public static void Register(DeityDefinition deity)
        {
            EnsureLoaded();
            Add(deity);
        }

        private static void EnsureLoaded()
        {
            if (_byId != null) return;
            // Build locally so an invalid definition cannot leave a partially initialized registry.
            var definitions = new Dictionary<string, DeityDefinition>(StringComparer.Ordinal);
            foreach (var deity in Resources.LoadAll<DeityDefinition>("Deities"))
            {
                ValidateId(deity.Id);
                if (definitions.ContainsKey(deity.Id))
                    throw new InvalidOperationException($"Duplicate deity ID '{deity.Id}'.");
                definitions.Add(deity.Id, deity);
            }
            _byId = definitions;
        }

        private static void Add(DeityDefinition deity)
        {
            if (!deity) throw new ArgumentNullException(nameof(deity));
            ValidateId(deity.Id);
            if (_byId.ContainsKey(deity.Id))
                throw new InvalidOperationException($"Duplicate deity ID '{deity.Id}'.");
            _byId.Add(deity.Id, deity);
        }

        public static void ValidateId(string id)
        {
            if (string.IsNullOrWhiteSpace(id))
                throw new ArgumentException("A stable deity ID is required.", nameof(id));
            foreach (var character in id)
                if (char.IsWhiteSpace(character) || char.IsControl(character))
                    throw new ArgumentException("Deity IDs cannot contain whitespace or control characters.", nameof(id));
        }
    }
}

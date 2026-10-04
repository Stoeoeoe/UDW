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
            AddTo(_byId, deity);
        }

        private static void EnsureLoaded()
        {
            if (_byId != null) return;
            // Build locally so an invalid definition cannot leave a partially initialized registry.
            var definitions = new Dictionary<string, DeityDefinition>(StringComparer.Ordinal);
            foreach (var deity in Resources.LoadAll<DeityDefinition>("Deities"))
                AddTo(definitions, deity);
            _byId = definitions;
        }

        private static void AddTo(Dictionary<string, DeityDefinition> map, DeityDefinition deity)
        {
            if (!deity) throw new ArgumentNullException(nameof(deity));
            ValidateId(deity.Id);
            if (!map.TryAdd(deity.Id, deity))
                throw new InvalidOperationException($"Duplicate deity ID '{deity.Id}'.");
        }

        public static void ValidateId(string id)
        {
            if (string.IsNullOrWhiteSpace(id))
                throw new ArgumentException("A stable deity ID is required.", nameof(id));
        }
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;

namespace Character
{
    /// <summary>Discovers built-in definitions and accepts definitions loaded by mods.</summary>
    public static class SkillDefinitions
    {
        private static Dictionary<string, SkillDefinition> _byId;

        public static SkillDefinition Get(string skillId)
        {
            EnsureLoaded();
            if (_byId.TryGetValue(skillId, out var result)) return result;
            throw new InvalidOperationException($"No skill definition registered for '{skillId}'.");
        }

        /// <summary>Call when a mod loads a SkillDefinition from an asset bundle.</summary>
        public static void Register(SkillDefinition definition)
        {
            EnsureLoaded();
            Add(definition);
        }

        private static void EnsureLoaded()
        {
            if (_byId != null) return;

            _byId = new Dictionary<string, SkillDefinition>(StringComparer.Ordinal);
            foreach (var definition in Resources.LoadAll<SkillDefinition>("Skills"))
                Add(definition);
        }

        private static void Add(SkillDefinition definition)
        {
            if (definition == null)
                throw new ArgumentNullException(nameof(definition));

            var id = definition.SkillId;
            var separator = id?.IndexOf(':') ?? -1;
            if (separator <= 0 || separator == id.Length - 1)
                throw new ArgumentException($"Skill '{definition.name}' needs a namespaced ID such as base:hammer_mastery.");

            foreach (var character in id)
                if (char.IsWhiteSpace(character))
                    throw new ArgumentException($"Skill ID '{id}' cannot contain whitespace.");

            if (_byId.ContainsKey(id))
                throw new InvalidOperationException($"Duplicate skill ID '{id}'.");

            _byId.Add(id, definition);
        }
    }
}

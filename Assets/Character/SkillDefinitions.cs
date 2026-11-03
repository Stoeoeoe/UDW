using System;
using System.Collections.Generic;
using Core.Catalogs;
using UnityEngine;

namespace Character
{
    /// <summary>Discovers built-in definitions and accepts definitions loaded by mods.</summary>
    public sealed class SkillDefinitions
    {
        private readonly Dictionary<string, SkillDefinition> Mods = new(StringComparer.Ordinal);
        private readonly SkillCatalog _catalog;
        public SkillDefinitions(SkillCatalog catalog) => _catalog = catalog;

        public SkillDefinition Get(string skillId)
        {
            if (Mods.TryGetValue(skillId, out var result)) return result;
            result = _catalog.Get(skillId);
            if (result) return result;
            throw new InvalidOperationException($"No skill definition registered for '{skillId}'.");
        }

        /// <summary>Call when a mod loads a SkillDefinition from an asset bundle.</summary>
        public void Register(SkillDefinition definition)
        {
            Add(definition);
        }

        private void Add(SkillDefinition definition)
        {
            if (definition == null)
                throw new ArgumentNullException(nameof(definition));

            definition.RequireValidConfiguration(); // New mod content enters the validated configuration boundary here.
            var id = definition.SkillId;

            if (_catalog.Get(id) || Mods.ContainsKey(id))
                throw new InvalidOperationException($"Duplicate skill ID '{id}'.");

            Mods.Add(id, definition);
        }
    }
}

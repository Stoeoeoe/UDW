using System;
using System.Collections.Generic;
using Core.Catalogs;
using Core.Common;
using UnityEngine;

namespace Character
{
    /// <summary>Discovers built-in definitions and accepts definitions loaded by mods.</summary>
    public static class SkillDefinitions
    {
        private static readonly Dictionary<string, SkillDefinition> Mods = new(StringComparer.Ordinal);

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void Reset() => Mods.Clear();

        public static SkillDefinition Get(string skillId)
        {
            var catalog = GetCatalog();
            if (Mods.TryGetValue(skillId, out var result)) return result;
            result = catalog.Get(skillId);
            if (result) return result;
            throw new InvalidOperationException($"No skill definition registered for '{skillId}'.");
        }

        /// <summary>Call when a mod loads a SkillDefinition from an asset bundle.</summary>
        public static void Register(SkillDefinition definition)
        {
            Add(definition);
        }

        private static SkillCatalog GetCatalog()
        {
            var catalog = CatalogResources.Load<SkillCatalog>(SkillCatalog.ResourceName);
            if (!catalog) throw new InvalidOperationException("The default SkillCatalog is missing. Refresh catalogs in the editor.");
            return catalog;
        }

        private static void Add(SkillDefinition definition)
        {
            if (definition == null)
                throw new ArgumentNullException(nameof(definition));

            var id = definition.SkillId;
            if (!DefinitionIdRules.IsNamespaced(id))
                throw new ArgumentException($"Skill '{definition.name}' needs a namespaced ID such as base:hammer_mastery.");

            if (GetCatalog().Get(id) || Mods.ContainsKey(id))
                throw new InvalidOperationException($"Duplicate skill ID '{id}'.");

            Mods.Add(id, definition);
        }
    }
}

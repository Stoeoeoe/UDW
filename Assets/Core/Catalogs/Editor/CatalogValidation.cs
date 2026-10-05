using System;
using System.Linq;
using System.Text.RegularExpressions;
using Character;
using Core.Spawning;
using Object = UnityEngine.Object;

namespace Core.Catalogs.Editor
{
    /// <summary>Definition identity checks at the authoring boundary, never on runtime reads.</summary>
    internal static class CatalogValidation
    {
        public static void Validate(DefinitionCatalog catalog, Object[] definitions)
        {
            foreach (var definition in definitions)
            {
                if (!definition) throw new InvalidOperationException($"Catalog '{catalog.name}' has a missing reference.");
                var id = catalog.GetId(definition);
                if (string.IsNullOrWhiteSpace(id))
                    throw new InvalidOperationException($"Catalog '{catalog.name}': '{definition.name}' needs an ID.");
                if (definition is SpawnedObject && !Regex.IsMatch(id, @"\A[a-z0-9_-]+:[a-z0-9_-]+\z"))
                    throw new InvalidOperationException($"Spawnable '{definition.name}' needs a lowercase namespace:name ID.");
                if (definition is SkillDefinition && (id.IndexOf(':') <= 0 || id.EndsWith(":") || id.Any(char.IsWhiteSpace)))
                    throw new InvalidOperationException($"Skill '{definition.name}' needs a namespace:name ID without whitespace.");
            }
            var duplicate = definitions.GroupBy(catalog.GetId, StringComparer.Ordinal).FirstOrDefault(group => group.Count() > 1);
            if (duplicate != null) throw new InvalidOperationException($"Catalog '{catalog.name}' has duplicate ID '{duplicate.Key}'.");
        }
    }
}

using System;
using System.Linq;
using Core.Common;
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
                if (!DefinitionIdRules.IsPresent(id))
                    throw new InvalidOperationException($"Catalog '{catalog.name}': '{definition.name}' needs an ID.");
                if (definition is SpawnedObject && !DefinitionIdRules.IsLowercaseNamespaced(id))
                    throw new InvalidOperationException($"Spawnable '{definition.name}' needs a lowercase namespace:name ID.");
                if (definition is ValidatedScriptableObject asset) ValidateConfiguration(asset);
            }
            var duplicate = definitions.GroupBy(catalog.GetId, catalog.IdComparer).FirstOrDefault(group => group.Count() > 1);
            if (duplicate != null) throw new InvalidOperationException($"Catalog '{catalog.name}' has duplicate ID '{duplicate.Key}'.");
        }

        private static void ValidateConfiguration(ValidatedScriptableObject asset)
        {
            var errors = asset.ValidateConfiguration();
            if (errors.Count > 0)
                throw new InvalidOperationException(string.Join("\n", errors.Select(error => error.ToString())));
        }
    }
}

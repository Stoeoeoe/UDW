using System;
using System.Collections.Generic;
using Core.Common;

namespace Core.Spawning.Editor
{
    /// <summary>Spawnable IDs are stored in saves, so they follow the strict lowercase namespace:name form.</summary>
    internal static class SpawnableCatalogValidation
    {
        [Core.Catalogs.Editor.DefinitionValidation(typeof(SpawnedObject))]
        public static void Validate(IEnumerable<SpawnedObject> prefabs)
        {
            foreach (var prefab in prefabs)
                if (!DefinitionIdRules.IsLowercaseNamespaced(prefab.Id))
                    throw new InvalidOperationException($"Spawnable '{prefab.name}' needs a lowercase namespace:name ID.");
        }
    }
}

using System;
using System.Collections.Generic;
using Core.Common;

namespace Core.Spawning.Editor
{
    /// <summary>Spawnable IDs are stored in saves, so they follow the strict lowercase namespace:name form.</summary>
    internal static class SpawnableCatalogValidation
    {
        public static void Validate(IEnumerable<SpawnedObject> prefabs)
        {
            foreach (var prefab in prefabs)
                if (!DefinitionIdRules.IsLowercaseNamespaced(prefab.PrefabId))
                    throw new InvalidOperationException($"Spawnable '{prefab.name}' needs a lowercase namespace:name ID.");
        }
    }
}

using System;
using System.Linq;
using Character;
using Core.Common;
using Core.Spawning;
using Plants;
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
                if (definition is SkillDefinition && !DefinitionIdRules.IsNamespaced(id))
                    throw new InvalidOperationException($"Skill '{definition.name}' needs a namespace:name ID without whitespace.");
                if (definition is PlantData plant) ValidatePlant(plant);
            }
            var duplicate = definitions.GroupBy(catalog.GetId, catalog.IdComparer).FirstOrDefault(group => group.Count() > 1);
            if (duplicate != null) throw new InvalidOperationException($"Catalog '{catalog.name}' has duplicate ID '{duplicate.Key}'.");
        }

        private static void ValidatePlant(PlantData plant)
        {
            var stages = plant.growthStages;
            if (stages == null || stages.Count == 0 || stages[0] == null || stages[0].daysToReachStage != 0)
                throw new InvalidOperationException($"Plant '{plant.name}' needs a day-zero seed stage.");

            var previousDay = -1;
            for (var index = 0; index < stages.Count; index++)
            {
                var stage = stages[index];
                if (stage == null || stage.daysToReachStage < 0 || stage.daysToReachStage <= previousDay)
                    throw new InvalidOperationException($"Plant '{plant.name}' growth stages need strictly increasing, nonnegative day thresholds.");
                var representation = stage.representation;
                UnityEngine.Object asset = null;
                if (representation != null)
                {
                    if (representation.type == Core.Common.SpriteOrPrefab.SpriteOrPrefabType.Sprite) asset = representation.sprite;
                    else if (representation.type == Core.Common.SpriteOrPrefab.SpriteOrPrefabType.Prefab) asset = representation.prefab;
                }
                if (!asset)
                    throw new InvalidOperationException($"Plant '{plant.name}' growth stage {index} needs a valid sprite or prefab representation.");
                previousDay = stage.daysToReachStage;
            }
        }
    }
}

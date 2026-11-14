using System;
using System.Linq;
using Character;
using Character.Editor;
using Core.Common;
using Core.Music;
using Core.Music.Editor;
using Core.Quests;
using Core.Quests.Editor;
using Core.Routines;
using Core.Routines.Editor;
using Core.Shops;
using Core.Shops.Editor;
using Core.Spawning;
using Core.Spawning.Editor;
using Object = UnityEngine.Object;

namespace Core.Catalogs.Editor
{
    /// <summary>
    /// Definition identity checks at the authoring boundary, never on runtime reads. Checks of references between a
    /// catalog's definitions and content authored elsewhere live with their feature; this only dispatches to them.
    /// </summary>
    internal static class CatalogValidation
    {
        public static void Validate(DefinitionCatalog catalog, Object[] definitions)
        {
            foreach (var definition in definitions)
            {
                if (!definition) throw new InvalidOperationException($"Catalog '{catalog.name}' has a missing reference.");
                if (!DefinitionIdRules.IsPresent(catalog.GetId(definition)))
                    throw new InvalidOperationException($"Catalog '{catalog.name}': '{definition.name}' needs an ID.");
                if (definition is ValidatedScriptableObject asset) ValidateConfiguration(asset);
            }
            var duplicate = definitions.GroupBy(catalog.GetId, catalog.IdComparer).FirstOrDefault(group => group.Count() > 1);
            if (duplicate != null) throw new InvalidOperationException($"Catalog '{catalog.name}' has duplicate ID '{duplicate.Key}'.");

            switch (catalog)
            {
                case SpawnableCatalog: SpawnableCatalogValidation.Validate(definitions.Cast<SpawnedObject>()); break;
                case ShopCatalog: ShopCatalogValidation.Validate(definitions.Cast<Shop>()); break;
                case CharacterCatalog: CharacterCatalogValidation.Validate(definitions.Cast<CharacterDefinition>()); break;
                case MusicCatalog: MusicCatalogValidation.Validate(definitions.Cast<MusicCue>()); break;
                case RoutineCatalog: RoutineCatalogValidation.Validate(definitions.Cast<RoutineDefinition>().ToArray()); break;
                case QuestCatalog: QuestCatalogValidation.Validate(definitions.Cast<QuestDefinition>()); break;
            }
        }

        private static void ValidateConfiguration(ValidatedScriptableObject asset)
        {
            var errors = asset.ValidateConfiguration();
            if (errors.Count > 0)
                throw new InvalidOperationException(string.Join("\n", errors.Select(error => error.ToString())));
        }
    }
}

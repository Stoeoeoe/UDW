using System;
using System.Linq;
using Core.Common;
using Core.Inventory;
using Core.Music;
using Core.Shops;
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
            if (catalog is ShopCatalog)
            {
                var itemIds = CatalogAssetDiscovery.Find("Assets", typeof(ItemDefinition)).Cast<ItemDefinition>().Select(item => item.ItemId).ToHashSet();
                foreach (var shop in definitions.Cast<Shop>())
                    foreach (var offering in shop.Offerings)
                        if (!itemIds.Contains(offering.ItemId))
                            throw new InvalidOperationException($"Shop '{shop.ShopId}' offers the unknown item '{offering.ItemId}'.");
            }
            if (catalog is MusicCatalog)
            {
                foreach (var group in definitions.Cast<MusicCue>().GroupBy(cue => cue.Theme))
                {
                    var first = group.First();
                    foreach (var cue in group.Skip(1))
                        if (cue.bpm != first.bpm || cue.beatsPerBar != first.beatsPerBar || cue.loopBars != first.loopBars ||
                            cue.stems[0].clip.frequency != first.stems[0].clip.frequency || cue.stems[0].clip.samples != first.stems[0].clip.samples)
                            throw new InvalidOperationException($"Music theme '{group.Key}' has arrangements with different timing or sample counts.");
                }
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

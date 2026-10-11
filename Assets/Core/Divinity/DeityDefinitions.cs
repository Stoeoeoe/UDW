using System;
using System.Collections.Generic;
using Core.Catalogs;
using UnityEngine;

namespace Core.Divinity
{
    /// <summary>Built-in deities come from a catalog; mods can register definitions at runtime.</summary>
    public static class DeityDefinitions
    {
        private static readonly Dictionary<string, DeityDefinition> Mods = new(StringComparer.Ordinal);

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void Reset() => Mods.Clear();

        public static DeityDefinition Get(string id)
        {
            if (TryGet(id, out var deity)) return deity;
            throw new InvalidOperationException($"No deity definition registered for '{id}'.");
        }

        public static bool TryGet(string id, out DeityDefinition deity)
        {
            var catalog = GetCatalog();
            if (Mods.TryGetValue(id, out deity)) return true;
            deity = catalog.Get(id);
            return deity;
        }

        public static void Register(DeityDefinition deity)
        {
            if (!deity) throw new ArgumentNullException(nameof(deity));
            deity.RequireValidConfiguration(); // Validate mod content once before registration.
            if (GetCatalog().Get(deity.Id) || !Mods.TryAdd(deity.Id, deity))
                throw new InvalidOperationException($"Duplicate deity ID '{deity.Id}'.");
        }

        private static DeityCatalog GetCatalog()
        {
            var catalog = CatalogResources.Load<DeityCatalog>(DeityCatalog.ResourceName);
            if (!catalog) throw new InvalidOperationException("The default DeityCatalog is missing. Refresh catalogs in the editor.");
            return catalog;
        }

    }
}

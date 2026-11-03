using System;
using System.Collections.Generic;
using Core.Catalogs;
using UnityEngine;

namespace Core.Divinity
{
    /// <summary>Built-in deities come from a catalog; mods can register definitions at runtime.</summary>
    public sealed class DeityDefinitions
    {
        private readonly Dictionary<string, DeityDefinition> Mods = new(StringComparer.Ordinal);
        private readonly DeityCatalog _catalog;
        public DeityDefinitions(DeityCatalog catalog) => _catalog = catalog;

        public DeityDefinition Get(string id)
        {
            if (TryGet(id, out var deity)) return deity;
            throw new InvalidOperationException($"No deity definition registered for '{id}'.");
        }

        public bool TryGet(string id, out DeityDefinition deity)
        {
            if (Mods.TryGetValue(id, out deity)) return true;
            deity = _catalog.Get(id);
            return deity;
        }

        public void Register(DeityDefinition deity)
        {
            if (!deity) throw new ArgumentNullException(nameof(deity));
            deity.RequireValidConfiguration(); // Validate mod content once before registration.
            if (_catalog.Get(deity.Id) || !Mods.TryAdd(deity.Id, deity))
                throw new InvalidOperationException($"Duplicate deity ID '{deity.Id}'.");
        }

    }
}

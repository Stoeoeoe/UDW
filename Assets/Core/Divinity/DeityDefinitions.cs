using Core.Catalogs;
using System;
using System.Collections.Generic;

namespace Core.Divinity
{
    /// <summary>Built-in deities come from a catalog; mods can register definitions at runtime.</summary>
    public sealed class DeityDefinitions
    {
        private readonly Dictionary<string, DeityDefinition> Mods = new(StringComparer.Ordinal);
        private readonly DefinitionCatalog _catalog;
        public DeityDefinitions(DefinitionCatalog catalog) => _catalog = catalog;

        public DeityDefinition Get(string id)
        {
            if (TryGet(id, out var deity)) return deity;
            throw new InvalidOperationException($"No deity definition registered for '{id}'.");
        }

        public bool TryGet(string id, out DeityDefinition deity)
        {
            if (Mods.TryGetValue(id, out deity)) return true;
            deity = _catalog.Get<DeityDefinition>(id);
            return deity;
        }

        public void Register(DeityDefinition deity)
        {
            if (!deity) throw new ArgumentNullException(nameof(deity));
            deity.RequireValidConfiguration(); // Validate mod content once before registration.
            if (_catalog.Get<DeityDefinition>(deity.Id) || !Mods.TryAdd(deity.Id, deity))
                throw new InvalidOperationException($"Duplicate deity ID '{deity.Id}'.");
        }

    }
}

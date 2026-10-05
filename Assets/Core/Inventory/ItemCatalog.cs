using Core.Catalogs;
using UnityEngine;

namespace Core.Inventory
{
    /// <summary>Explicit asset references for resolving saved IDs, populated by the editor.</summary>
    [CreateAssetMenu(menuName = "Game/Catalogs/Items")]
    public sealed class ItemCatalog : DefinitionCatalog<ItemDefinition>
    {
        public const string ResourceName = "ItemCatalog";
        // Existing items live under Resources/Items and Plants. Preserve their authored locations.
        public override string Path => "Assets";
        protected override string GetDefinitionId(ItemDefinition definition) => definition.ItemId;
        public static ItemDefinition Find(string id)
        {
            var catalog = CatalogResources.Load<ItemCatalog>(ResourceName);
            return catalog ? catalog.Get(id) : null;
        }
    }
}

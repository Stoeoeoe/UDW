using Core.Catalogs;
using Core.Scripting;
using UnityEngine;

namespace Core.Inventory
{
    /// <summary>Explicit asset references for resolving saved IDs, populated by the editor.</summary>
    [CreateAssetMenu(menuName = "Game/Catalogs/Items")]
    [DefaultCatalog(ResourceName)]
    [LuaResource("item", DescriptionMember = nameof(ItemDefinition.Name))]
    public sealed class ItemCatalog : DefinitionCatalog<ItemDefinition>
    {
        public const string ResourceName = "ItemCatalog";
        // Existing items live under Resources/Items and Plants. Preserve their authored locations.
        public override string Path => "Assets";
        protected override string GetDefinitionId(ItemDefinition definition) => definition.Id;
        public ItemDefinition Find(string id) => Get(id);
    }
}

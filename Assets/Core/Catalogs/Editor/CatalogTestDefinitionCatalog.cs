using Core.Inventory;

namespace Core.Catalogs.Editor
{
    public sealed class CatalogTestDefinitionCatalog : DefinitionCatalog<ItemDefinition>
    {
        public string Folder;
        public override string Path => Folder;
        protected override string GetDefinitionId(ItemDefinition definition) => definition.ItemId;
    }
}

using System;
using Core.Catalogs;
using UnityEngine;

namespace Core.Shops
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Shops")]
    [DefaultCatalog(ResourceName)]
    public sealed class ShopCatalog : DefinitionCatalog<Shop>
    {
        public const string ResourceName = "ShopCatalog";
        public override string Path => "Assets";
        protected override string GetDefinitionId(Shop definition) => definition.Id;

        public Shop Require(string id) =>
            Get(id) ?? throw new InvalidOperationException($"Shop '{id}' is not registered and enabled.");
    }
}

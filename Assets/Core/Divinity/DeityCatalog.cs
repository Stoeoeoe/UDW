using Core.Catalogs;
using UnityEngine;

namespace Core.Divinity
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Deities")]
    public sealed class DeityCatalog : DefinitionCatalog<DeityDefinition>
    {
        public const string ResourceName = "DeityCatalog";
        public override string Path => "Assets/Resources/Deities";
        protected override string GetDefinitionId(DeityDefinition definition) => definition.Id;
    }
}

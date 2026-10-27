using Core.Catalogs;
using UnityEngine;

namespace Core.Scripting
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Sounds")]
    public sealed class SoundCatalog : DefinitionCatalog<SoundDefinition>
    {
        public const string ResourceName = "SoundCatalog";
        public override string Path => "Assets";
        protected override string GetDefinitionId(SoundDefinition definition) => definition.Id;
    }
}

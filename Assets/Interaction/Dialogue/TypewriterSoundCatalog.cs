using Core.Catalogs;
using Core.Scripting;
using UnityEngine;

namespace Interaction.Dialog
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Typewriter Sounds")]
    [DefaultCatalog(ResourceName)]
    [LuaResource("typewriterSound")]
    public sealed class TypewriterSoundCatalog : DefinitionCatalog<TypewriterSound>
    {
        public const string ResourceName = "TypewriterSoundCatalog";
        public override string Path => "Assets";
        protected override string GetDefinitionId(TypewriterSound definition) => definition.Id;
    }
}

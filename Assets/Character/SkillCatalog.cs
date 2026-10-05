using Core.Catalogs;
using UnityEngine;

namespace Character
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Skills")]
    public sealed class SkillCatalog : DefinitionCatalog<SkillDefinition>
    {
        public const string ResourceName = "SkillCatalog";
        public override string Path => "Assets/Resources/Skills";
        protected override string GetDefinitionId(SkillDefinition definition) => definition.SkillId;
    }
}

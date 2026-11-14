using Core.Catalogs;
using UnityEngine;

namespace Core.Quests
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Quests")]
    [DefaultCatalog(ResourceName)]
    public sealed class QuestCatalog : DefinitionCatalog<QuestDefinition>
    {
        public const string ResourceName = "QuestCatalog";
        public override string Path => "Assets";
        protected override string GetDefinitionId(QuestDefinition definition) => definition.QuestId;
    }
}

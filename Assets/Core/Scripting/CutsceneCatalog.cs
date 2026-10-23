using Core.Catalogs;
using UnityEngine;

namespace Core.Scripting
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Cutscenes")]
    public sealed class CutsceneCatalog : DefinitionCatalog<CutsceneDefinition>
    {
        public const string ResourceName = "CutsceneCatalog";
        public override string Path => "Assets";
        protected override string GetDefinitionId(CutsceneDefinition definition) => definition.CutsceneId;
    }
}

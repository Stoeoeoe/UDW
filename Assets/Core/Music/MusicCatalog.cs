using Core.Catalogs;
using UnityEngine;

namespace Core.Music
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Music")]
    [DefaultCatalog(MusicCatalog.ResourceName)]
    [Core.Scripting.LuaResource("musicCue")]
    public sealed class MusicCatalog : DefinitionCatalog<MusicCue>
    {
        public const string ResourceName = "MusicCatalog";
        public override string Path => "Assets";
        protected override string GetDefinitionId(MusicCue definition) => definition.id;
    }
}

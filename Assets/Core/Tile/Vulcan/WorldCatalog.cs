using Core.Catalogs;
using UnityEngine;

namespace Core.Tile.Vulcanus
{
    /// <summary>
    /// The imported Vulcanus worlds, so the game can read every map's prefab (navigation, anchors, links) without
    /// loading its scene. One world per Vulcanus project; the asset's name identifies it.
    /// </summary>
    [CreateAssetMenu(menuName = "Game/Catalogs/Worlds")]
    [DefaultCatalog(ResourceName)]
    public sealed class WorldCatalog : DefinitionCatalog<VulcanusWorldCatalog>
    {
        public const string ResourceName = "WorldCatalog";
        public override string Path => "Assets";
        protected override string GetDefinitionId(VulcanusWorldCatalog definition) => definition.name;
    }
}

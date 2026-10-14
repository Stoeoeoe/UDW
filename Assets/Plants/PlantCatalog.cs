using Core.Catalogs;
using UnityEngine;

namespace Plants
{
    /// <summary>Discovered plant definitions and their enabled ID lookup for runtime crop resolution.</summary>
    [CreateAssetMenu(menuName = "Game/Catalogs/Plants")]
    public sealed class PlantCatalog : DefinitionCatalog<PlantData>
    {
        public const string ResourceName = "PlantCatalog";
        // Plant definitions exist under both Plants and Resources/Plants, including externally authored content.
        public override string Path => "Assets";
        protected override string GetDefinitionId(PlantData definition) => definition.plantId;
    }
}

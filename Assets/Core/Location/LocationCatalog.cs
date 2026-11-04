using System;
using Core.Catalogs;
using UnityEngine;

namespace Core.Location
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Locations")]
    [DefaultCatalog(ResourceName)]
    public sealed class LocationCatalog : DefinitionCatalog<LocationData>
    {
        public const string ResourceName = "LocationCatalog";
        public override string Path => "Assets";
        public override StringComparer IdComparer => StringComparer.OrdinalIgnoreCase;
        protected override string GetDefinitionId(LocationData definition) => definition.id;
    }
}

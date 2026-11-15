using System;
using Core.Catalogs;
using UnityEngine;

namespace Core.Routines
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Routines")]
    [DefaultCatalog(ResourceName)]
    public sealed class RoutineCatalog : DefinitionCatalog<RoutineDefinition>
    {
        public const string ResourceName = "RoutineCatalog";
        public override string Path => "Assets";
        protected override string GetDefinitionId(RoutineDefinition definition) => definition.Id;

        public RoutineDefinition Require(string id) =>
            Get(id) ?? throw new InvalidOperationException($"Routine '{id}' is not registered and enabled.");
    }
}

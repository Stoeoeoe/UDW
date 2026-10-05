using System.Collections.Generic;
using Core.Catalogs;
using UnityEngine;

namespace Core.Spawning
{
    /// <summary>Explicit prefab references registered at startup, independently of runtime folder conventions.</summary>
    [CreateAssetMenu(menuName = "Game/Spawnable Catalog")]
    public sealed class SpawnableCatalog : DefinitionCatalog<SpawnedObject>
    {
        public const string PrefabFolder = "Assets/Content/Spawnables";

        public override string Path => PrefabFolder;
        protected override string GetDefinitionId(SpawnedObject definition) => definition.PrefabId;
        public IEnumerable<SpawnedObject> Prefabs => EnabledDefinitions;
    }
}

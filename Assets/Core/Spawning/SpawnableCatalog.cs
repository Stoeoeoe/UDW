using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Core.Spawning
{
    /// <summary>Explicit prefab references registered at startup, independently of runtime folder conventions.</summary>
    [CreateAssetMenu(menuName = "Game/Spawnable Catalog")]
    public sealed class SpawnableCatalog : ScriptableObject
    {
        public const string PrefabFolder = "Assets/Content/Spawnables";

        [ValidateInput(nameof(IdsAreValid), "Every prefab needs a unique lowercase 'namespace:name' prefabId.")]
        [AssetList(Path = "Content/Spawnables", AutoPopulate = true)]
        [SerializeField] private SpawnedObject[] prefabs = Array.Empty<SpawnedObject>();

        public IReadOnlyList<SpawnedObject> Prefabs => prefabs;
        public bool HasValidIds => IdsAreValid(prefabs);

        private static bool IdsAreValid(SpawnedObject[] list) =>
            list != null && list.All(p => p && IsWellFormed(p.PrefabId)) &&
            list.Select(p => p.PrefabId).Distinct(StringComparer.Ordinal).Count() == list.Length;

        private static bool IsWellFormed(string id) =>
            id != null && Regex.IsMatch(id, @"\A[a-z0-9_-]+:[a-z0-9_-]+\z");
    }
}

using UnityEngine;

namespace Core.Tile.Vulcanus
{
    /// <summary>Marks a placed entity with the instance ID it has on the Vulcanus map, so routines can name it.</summary>
    public sealed class VulcanusMapEntity : MonoBehaviour
    {
        [SerializeField] private string entityId;

        public string EntityId => entityId;

        public void Configure(string id) => entityId = id;
    }
}

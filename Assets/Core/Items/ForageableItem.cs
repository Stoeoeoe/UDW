using Core.Common;
using Core.Inventory;
using UnityEngine;

namespace Core.Items
{
    /// <summary>Inventory definition for forage, including its lifetime before collection.</summary>
    [CreateAssetMenu(menuName = "Game/Items/Forageable Item")]
    public sealed class ForageableItem : ItemDefinition
    {
        [field: SerializeField, Validation.Min(1),
                Tooltip("Game days before ground forage disappears. One day expires the next morning. Collected items do not expire.")]
        public int GroundLifetimeDays { get; private set; } = 3;
    }
}

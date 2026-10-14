using Core.Inventory;
using UnityEngine;

namespace Plants
{
    /// <summary>Inventory item definition for produce yielded by harvesting a crop.</summary>
    [CreateAssetMenu(fileName = "Produce", menuName = "Game/Items/Plants/Produce")]
    public sealed class ProduceItem : ItemDefinition { }
}

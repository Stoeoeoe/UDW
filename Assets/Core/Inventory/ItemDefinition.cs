using UnityEngine;

namespace Core.Inventory
{
    /// <summary>
    /// Base ScriptableObject for all game items.
    /// Subclass to add game-specific data (tools, seeds, equipment, etc.).
    /// </summary>
    public abstract class ItemDefinition : ScriptableObject
    {
        [field: SerializeField] public string ItemId      { get; private set; }
        [field: SerializeField] public string ItemName    { get; private set; }
        [field: SerializeField] public Sprite Icon        { get; private set; }
        [field: SerializeField] public string Description { get; private set; }
        [field: SerializeField] public int    MaxStackSize { get; private set; } = 99;

        void OnValidate()
        {
            // Default ItemId to the asset name when unset; avoids empty-string collisions.
            if (string.IsNullOrEmpty(ItemId))
                ItemId = name;
        }
    }
}

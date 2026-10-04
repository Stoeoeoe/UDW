using UnityEngine;
using UnityEngine.Audio;

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
        [field: SerializeField] public string Category    { get; private set; }
        [field: SerializeField] public Sprite Icon        { get; private set; }
        [field: SerializeField] public string Description { get; private set; }
        [field: SerializeField] public int    MaxStackSize { get; private set; } = 99;

        [Header("Trading")]
        [Tooltip("Base price per item paid by the buyer.")]
        [field: SerializeField, Min(0)] public int BuyBasePrice { get; private set; }
        [Tooltip("Base price per item received by the seller. Zero-value items should not be sold automatically.")]
        [field: SerializeField, Min(0)] public int SellBasePrice { get; private set; }

        [Header("World Item")]
        [Tooltip("Visual prefab spawned as a child of WorldItem. If null a default sprite child is created from Icon.")]
        [field: SerializeField] public GameObject WorldRepresentationPrefab { get; private set; }
        [Tooltip("Pickup sound override. If null ItemManager's default sound plays.")]
        [field: SerializeField] public AudioClip  PickupSound               { get; private set; }

        void OnValidate()
        {
            // Default ItemId to the asset name when unset; avoids empty-string collisions.
            if (string.IsNullOrEmpty(ItemId))
                ItemId = name;
        }
    }
}

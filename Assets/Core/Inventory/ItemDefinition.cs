using Core.Common;
using Newtonsoft.Json;
using UnityEngine;

namespace Core.Inventory
{
    /// <summary>
    /// Base ScriptableObject for all game items.
    /// Subclass to add game-specific data (tools, seeds, equipment, etc.).
    /// </summary>
    public abstract class ItemDefinition : ValidatedScriptableObject<ItemDefinitionValidator>
    {
        [SerializeField, Validation.Id("Assign a stable, nonblank item ID."), JsonProperty("id")]
        private string itemId;

        [SerializeField, JsonProperty("name")]
        private string itemName;

        [SerializeField]
        private string category;

        [SerializeField]
        private Sprite icon;

        [SerializeField]
        private string description;

        [SerializeField, Validation.Min(1)]
        private int maxStackSize = 99;

        [Tooltip("Protect essential tools and quest items from being left on the ground. Redundant, replaceable items can remain droppable.")]
        [SerializeField]
        private bool preventDropping;

        [Header("Trading")]
        [Tooltip("Base price per item paid by the buyer.")]
        [SerializeField, Validation.Min(0, "Must be nonnegative.")]
        private int buyBasePrice;

        [Tooltip("Base price per item received by the seller. Zero-value items should not be sold automatically.")]
        [SerializeField, Validation.Min(0, "Must be nonnegative.")]
        private int sellBasePrice;

        [Header("World Item")]
        [Tooltip("Visual prefab spawned as a child of WorldItem. If null a default sprite child is created from Icon.")]
        [SerializeField]
        private GameObject worldRepresentationPrefab;

        [Tooltip("Pickup sound override. If null ItemManager's default sound plays.")]
        [SerializeField]
        private AudioClip pickupSound;

        public string ItemId => itemId;
        public string ItemName => itemName;
        public string Category => category;
        public Sprite Icon => icon;
        public string Description => description;
        public int MaxStackSize => maxStackSize;
        public bool PreventDropping => preventDropping;
        public int BuyBasePrice => buyBasePrice;
        public int SellBasePrice => sellBasePrice;
        public GameObject WorldRepresentationPrefab => worldRepresentationPrefab;
        public AudioClip PickupSound => pickupSound;

    }
}

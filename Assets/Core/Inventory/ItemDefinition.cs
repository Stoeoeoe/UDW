using Core.Common;
using UnityEngine;
using UnityEngine.Audio;

namespace Core.Inventory
{
    /// <summary>
    /// Base ScriptableObject for all game items.
    /// Subclass to add game-specific data (tools, seeds, equipment, etc.).
    /// </summary>
    public abstract class ItemDefinition : ValidatedScriptableObject<ItemDefinitionValidator>
    {
        [SerializeField, Validation.Id("Assign a stable, nonblank item ID.")]
        private string _itemId;

        [SerializeField]
        private string _itemName;

        [SerializeField]
        private string _category;

        [SerializeField]
        private Sprite _icon;

        [SerializeField]
        private string _description;

        [SerializeField, Validation.Min(1)]
        private int _maxStackSize = 99;

        [Tooltip("Protect essential tools and quest items from being left on the ground. Redundant, replaceable items can remain droppable.")]
        [SerializeField]
        private bool _preventDropping;

        [Header("Trading")]
        [Tooltip("Base price per item paid by the buyer.")]
        [SerializeField, Validation.Min(0, "Must be nonnegative.")]
        private int _buyBasePrice;

        [Tooltip("Base price per item received by the seller. Zero-value items should not be sold automatically.")]
        [SerializeField, Validation.Min(0, "Must be nonnegative.")]
        private int _sellBasePrice;

        [Header("World Item")]
        [Tooltip("Visual prefab spawned as a child of WorldItem. If null a default sprite child is created from Icon.")]
        [SerializeField]
        private GameObject _worldRepresentationPrefab;

        [Tooltip("Pickup sound override. If null ItemManager's default sound plays.")]
        [SerializeField]
        private AudioClip _pickupSound;

        public string ItemId => _itemId;
        public string ItemName => _itemName;
        public string Category => _category;
        public Sprite Icon => _icon;
        public string Description => _description;
        public int MaxStackSize => _maxStackSize;
        public bool PreventDropping => _preventDropping;
        public int BuyBasePrice => _buyBasePrice;
        public int SellBasePrice => _sellBasePrice;
        public GameObject WorldRepresentationPrefab => _worldRepresentationPrefab;
        public AudioClip PickupSound => _pickupSound;

    }
}

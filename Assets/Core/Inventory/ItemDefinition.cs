using Core.Common;
using UnityEngine;

namespace Core.Inventory
{
    /// <summary>
    /// Base ScriptableObject for all game items.
    /// Subclass to add game-specific data (tools, seeds, equipment, etc.).
    /// </summary>
    [Core.Catalogs.DefinitionResource(IdFormat = Core.Catalogs.DefinitionIdFormat.Any)]
    [Core.Scripting.LuaResource("item", DescriptionMember = nameof(ItemDefinition.Name))]
    public abstract class ItemDefinition : Core.Catalogs.DefinitionScriptableObject
    {
        [field: SerializeField] public string Name { get; private set; }
        [field: SerializeField] public string Category { get; private set; }
        [field: SerializeField] public Sprite Icon { get; private set; }
        [field: SerializeField] public string Description { get; private set; }
        [field: SerializeField, Validation.Min(1)] public int MaxStackSize { get; private set; } = 99;

        [field: SerializeField, Tooltip("Protect essential tools and quest items from being left on the ground. Redundant, replaceable items can remain droppable.")]
        public bool PreventDropping { get; private set; }

        [field: Header("Trading")]
        [field: SerializeField, Tooltip("Base price per item paid by the buyer."), Validation.Min(0, "Must be nonnegative.")]
        public int BuyBasePrice { get; private set; }

        [field: SerializeField, Tooltip("Base price per item received by the seller. Zero-value items should not be sold automatically."),
                Validation.Min(0, "Must be nonnegative.")]
        public int SellBasePrice { get; private set; }

        [field: Header("World Item")]
        [field: SerializeField, Tooltip("Visual prefab spawned as a child of WorldItem. If null a default sprite child is created from Icon.")]
        public GameObject WorldRepresentationPrefab { get; private set; }

        [field: SerializeField, Tooltip("Pickup sound override. If null ItemManager's default sound plays.")]
        public AudioClip PickupSound { get; private set; }
    }
}

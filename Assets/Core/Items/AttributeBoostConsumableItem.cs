using Character;
using Core.Common;
using Items;
using UnityEngine;

namespace Core.Items
{
    /// <summary>A consumable that applies or refreshes a temporary attribute boost without restoring resource points.</summary>
    [CreateAssetMenu(menuName = "Game/Items/Attribute Boost Consumable")]
    public sealed class AttributeBoostConsumableItem : ConsumableItem
    {
        private static readonly AttributeBoostConsumableItemValidator Validator = new();
        protected override IScriptableObjectValidator ConfigurationValidator => Validator;

        [Tooltip("In-game minutes, including time skipped overnight.")]
        [SerializeField, Validation.Min(1)] private int boostDurationMinutes = 120;
        [SerializeField, Validation.NotEmpty, Validation.RequiredElements, Validation.Nested]
        private AttributeBonus[] boosts;

        public int BoostDurationMinutes => boostDurationMinutes;
        public System.Collections.Generic.IReadOnlyList<AttributeBonus> Boosts => boosts;
        public override bool CanConsume(GameCharacter character) => true;
        public override void Apply(GameCharacter character) => character.Boosts.Apply($"item:{ItemId}", boostDurationMinutes, boosts);
    }
}

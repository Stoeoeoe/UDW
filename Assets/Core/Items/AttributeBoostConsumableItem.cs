using System.Collections.Generic;
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

        [field: SerializeField, Validation.Min(1), Tooltip("In-game minutes, including time skipped overnight.")]
        public int BoostDurationMinutes { get; private set; } = 120;
        [field: SerializeField, Validation.NotEmpty, Validation.RequiredElements, Validation.Nested]
        public AttributeBonus[] Boosts { get; private set; }
        public override bool CanConsume(GameCharacter character) => true;
        public override void Apply(GameCharacter character) => character.Boosts.Apply($"item:{Id}", BoostDurationMinutes, Boosts);
    }
}

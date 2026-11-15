using Character;
using Core.Common;
using Items;
using UnityEngine;

namespace Core.Items
{
    [CreateAssetMenu(menuName = "Game/Items/Stamina Consumable")]
    public sealed class StaminaConsumableItem : ConsumableItem
    {
        private static readonly StaminaConsumableItemValidator Validator = new();
        protected override IScriptableObjectValidator ConfigurationValidator => Validator;

        [field: SerializeField, Validation.Min(1, "Must restore at least one stamina.")]
        public int StaminaRestored { get; private set; } = 10;

        public override bool CanConsume(GameCharacter character) => character.Stamina.CurrentStamina < character.Stamina.MaxStamina;
        public override void Apply(GameCharacter character) => character.Stamina.RestoreStamina(StaminaRestored);
    }
}

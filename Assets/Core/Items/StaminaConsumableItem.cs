using Core.Common;
using Character;
using Items;
using UnityEngine;

namespace Core.Items
{
    [CreateAssetMenu(menuName = "Game/Items/Stamina Consumable")]
    public sealed class StaminaConsumableItem : ConsumableItem
    {
        private static readonly StaminaConsumableItemValidator Validator = new();
        protected override IScriptableObjectValidator ConfigurationValidator => Validator;

        [SerializeField, Validation.Min(1, "Must restore at least one stamina.")]
        private int _staminaRestored = 10;

        public int StaminaRestored => _staminaRestored;

        public override bool CanConsume(GameCharacter character) => character && character.CanRestoreStamina && character.CurrentStamina < character.MaxStamina;
        public override void Apply(GameCharacter character) => character.RestoreStamina(StaminaRestored);
    }
}

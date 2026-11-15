using System;
using Character;
using Core.Common;
using Core.Inventory;
using UnityEngine;

namespace Core.Equipment
{
    [CreateAssetMenu(menuName = "Game/Equipment/Item")]
    public sealed class WornEquipmentItem : ItemDefinition
    {
        private static readonly WornEquipmentItemValidator Validator = new();
        protected override IScriptableObjectValidator ConfigurationValidator => Validator;

        [field: SerializeField, Validation.Required("Must not be null; an empty array fits no slots."), Validation.ValidReference]
        public EquipmentSlotDefinition[] AllowedSlots { get; private set; } = Array.Empty<EquipmentSlotDefinition>();

        [Serializable] public struct Modifier
        {
            [Validation.DefinedEnum("Select a defined character attribute.")] public CharacterAttributeType Attribute;
            [Validation.Finite("Must be finite; negative modifiers are allowed.")] public float Flat;
            [Validation.Finite("Must be finite; negative modifiers are allowed.")] public float Percent;
        }
        [field: SerializeField, Validation.Required("Must not be null; an empty array grants no bonuses."), Validation.Nested]
        public Modifier[] Modifiers { get; private set; } = Array.Empty<Modifier>();

        public bool Fits(EquipmentSlotDefinition slot) => slot && Array.Exists(AllowedSlots, s => s.Id == slot.Id);
    }
}

using Core.Common;
using System;
using Character;
using Core.Inventory;
using UnityEngine;

namespace Core.Equipment
{
    [CreateAssetMenu(menuName = "Game/Equipment/Item")]
    public sealed class WornEquipmentItem : ItemDefinition
    {
        private static readonly WornEquipmentItemValidator Validator = new();
        protected override IScriptableObjectValidator ConfigurationValidator => Validator;

        [SerializeField, Validation.Required("Must not be null; an empty array fits no slots."), Validation.ValidReference]
        private EquipmentSlotDefinition[] _allowedSlots = Array.Empty<EquipmentSlotDefinition>();

        [Serializable] public struct Modifier
        {
            [Validation.DefinedEnum("Select a defined character attribute.")] public CharacterAttributeType Attribute;
            [Validation.Finite("Must be finite; negative modifiers are allowed.")] public float Flat;
            [Validation.Finite("Must be finite; negative modifiers are allowed.")] public float Percent;
        }
        [SerializeField, Validation.Required("Must not be null; an empty array grants no bonuses."), Validation.Nested]
        private Modifier[] _modifiers = Array.Empty<Modifier>();

        public EquipmentSlotDefinition[] AllowedSlots => _allowedSlots;
        public Modifier[] Modifiers => _modifiers;

        public bool Fits(EquipmentSlotDefinition slot) => slot && Array.Exists(AllowedSlots, s => s.Id == slot.Id);
    }
}

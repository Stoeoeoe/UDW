using Core.Common;
using UnityEngine;

namespace Core.Equipment
{
    [CreateAssetMenu(menuName = "Game/Equipment/Slot")]
    public sealed class EquipmentSlotDefinition : ValidatedScriptableObject<EquipmentSlotDefinitionValidator>
    {
        [SerializeField, Validation.Id("Assign a stable, nonblank equipment slot ID.")]
        private string _id;

        [SerializeField]
        private string _label;

        [SerializeField]
        private Sprite _icon;

        public string Id => _id;
        public string Label => _label;
        public Sprite Icon => _icon;

    }
}

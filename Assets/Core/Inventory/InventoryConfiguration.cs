using Core.Common;
using System;
using Core.Equipment;
using UnityEngine;

namespace Core.Inventory
{
    [CreateAssetMenu(menuName = "Game/Inventory/Configuration")]
    public sealed class InventoryConfiguration : ValidatedScriptableObject<InventoryConfigurationValidator>
    {
        [SerializeField, Validation.Min(1)]
        private int _columns = 10;

        [SerializeField, Validation.Min(1)]
        private int _toolbeltSlots = 10;

        [SerializeField, Validation.Min(1)]
        private int _startingRows = 1;

        [Serializable] public struct Upgrade
        {
            [Validation.Min(1)] public int Rows;
            [Validation.Min(0, "Must be nonnegative.")] public int Price;
        }
        [SerializeField, Validation.Required("Must not be null; an empty array disables upgrades."), Validation.Nested]
        private Upgrade[] _upgrades = Array.Empty<Upgrade>();

        [SerializeField, Validation.Required("Must not be null; an empty array disables equipment."), Validation.ValidReference]
        private EquipmentSlotDefinition[] _equipmentSlots = Array.Empty<EquipmentSlotDefinition>();

        public int Columns => _columns;
        public int ToolbeltSlots => _toolbeltSlots;
        public int StartingRows => _startingRows;
        public Upgrade[] Upgrades => _upgrades;
        public EquipmentSlotDefinition[] EquipmentSlots => _equipmentSlots;

        public bool TryGetUpgrade(int capacity, out Upgrade upgrade)
        {
            upgrade = default;
            foreach (var candidate in Upgrades)
                if (candidate.Rows * Columns > capacity && (upgrade.Rows == 0 || candidate.Rows < upgrade.Rows))
                    upgrade = candidate;
            return upgrade.Rows > 0;
        }
    }
}

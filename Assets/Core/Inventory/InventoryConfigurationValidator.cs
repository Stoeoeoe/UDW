using System;
using System.Collections.Generic;
using Core.Common;

namespace Core.Inventory
{
    public sealed class InventoryConfigurationValidator : ScriptableObjectValidator<InventoryConfiguration>
    {
        protected override void CollectConfigurationErrors(InventoryConfiguration asset, List<ConfigurationError> errors)
        {
            ValidateCapacity(asset, asset.StartingRows, "_startingRows", errors);
            if (asset.Upgrades != null)
                for (var i = 0; i < asset.Upgrades.Length; i++)
                    ValidateCapacity(asset, asset.Upgrades[i].Rows, $"_upgrades[{i}].Rows", errors);
            if (asset.EquipmentSlots == null) return; // Required attribute reports this.
            var ids = new HashSet<string>(StringComparer.Ordinal);
            for (var i = 0; i < asset.EquipmentSlots.Length; i++)
            {
                var slot = asset.EquipmentSlots[i];
                if (slot && !ids.Add(slot.Id)) Report(errors, asset, $"_equipmentSlots[{i}]._id", "Slot IDs must be unique in this configuration.");
            }
        }

        private static void ValidateCapacity(InventoryConfiguration asset, int rows, string field, List<ConfigurationError> errors)
        {
            // Positivity belongs to attributes; capacity depends on two configured values.
            if (rows > 0 && asset.Columns > 0 && (long)rows * asset.Columns > int.MaxValue)
                Report(errors, asset, field, "Rows * Columns must fit in an int.");
        }
    }
}

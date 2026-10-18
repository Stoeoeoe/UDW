using System.Collections.Generic;
using Core.Common;

namespace Core.Items
{
    /// <summary>Requires nonnegative boost values; shared rules validate duration and nested bonus fields.</summary>
    public sealed class AttributeBoostConsumableItemValidator : ScriptableObjectValidator<AttributeBoostConsumableItem>
    {
        protected override void CollectConfigurationErrors(AttributeBoostConsumableItem asset, List<ConfigurationError> errors)
        {
            if (asset.Boosts == null) return; // Shared rules report missing collections and entries.
            for (var i = 0; i < asset.Boosts.Count; i++)
            {
                var bonus = asset.Boosts[i];
                if (bonus != null && (bonus.Flat < 0 || bonus.Percent < 0))
                    Report(errors, asset, $"boosts[{i}]", "Attribute boosts require nonnegative flat and percentage bonuses.");
            }
        }
    }
}

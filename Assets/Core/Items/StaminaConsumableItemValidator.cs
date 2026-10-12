using System.Collections.Generic;
using Core.Common;

namespace Core.Items
{
    public sealed class StaminaConsumableItemValidator : ScriptableObjectValidator<StaminaConsumableItem>
    {
        protected override void CollectConfigurationErrors(StaminaConsumableItem asset, List<ConfigurationError> errors)
        {
            // All configuration rules are declared on the definition and its nested data.
        }
    }
}

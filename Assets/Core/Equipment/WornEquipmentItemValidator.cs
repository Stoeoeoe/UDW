using System.Collections.Generic;
using Core.Common;

namespace Core.Equipment
{
    public sealed class WornEquipmentItemValidator : ScriptableObjectValidator<WornEquipmentItem>
    {
        protected override void CollectConfigurationErrors(WornEquipmentItem asset, List<ConfigurationError> errors)
        {
            // All configuration rules are declared on the definition and its nested data.
        }
    }
}

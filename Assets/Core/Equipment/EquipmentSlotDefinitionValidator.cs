using System.Collections.Generic;
using Core.Common;

namespace Core.Equipment
{
    public sealed class EquipmentSlotDefinitionValidator : ScriptableObjectValidator<EquipmentSlotDefinition>
    {
        protected override void CollectConfigurationErrors(EquipmentSlotDefinition asset, List<ConfigurationError> errors)
        {
            // All configuration rules are declared on the definition and its nested data.
        }
    }
}

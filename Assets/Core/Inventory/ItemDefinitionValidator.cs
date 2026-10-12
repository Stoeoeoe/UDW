using System.Collections.Generic;
using Core.Common;

namespace Core.Inventory
{
    public sealed class ItemDefinitionValidator : ScriptableObjectValidator<ItemDefinition>
    {
        protected override void CollectConfigurationErrors(ItemDefinition asset, List<ConfigurationError> errors)
        {
            // Common item rules are declared on ItemDefinition's serialized fields.
            // This validator remains the default hook for items with no additional rules.
        }
    }
}

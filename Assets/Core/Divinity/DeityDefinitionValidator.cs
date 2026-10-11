using System.Collections.Generic;
using Core.Common;

namespace Core.Divinity
{
    public sealed class DeityDefinitionValidator : ScriptableObjectValidator<DeityDefinition>
    {
        protected override void CollectConfigurationErrors(DeityDefinition asset, List<ConfigurationError> errors)
        {
            // All configuration rules are declared on the definition and its nested data.
        }
    }
}

using System.Collections.Generic;
using Core.Common;

namespace Interaction.Tools
{
    public sealed class ToolDataValidator : ScriptableObjectValidator<ToolData>
    {
        protected override void CollectConfigurationErrors(ToolData asset, List<ConfigurationError> errors)
        {
            // All configuration rules are declared on the definition and its nested data.
        }
    }
}

using System.Collections.Generic;
using Core.Common;

namespace Interaction.Tools
{
    public sealed class ToolDataValidator : ScriptableObjectValidator<ToolData>
    {
        protected override void CollectConfigurationErrors(ToolData asset, List<ConfigurationError> errors)
        {
            if (asset.maxCharge > 0 && (asset.chargePerUsage <= 0 || asset.chargePerUsage > asset.maxCharge))
                Report(errors, asset, "_chargePerUsage", "Charge per usage must be positive and fit within the tool's capacity.");
        }
    }
}

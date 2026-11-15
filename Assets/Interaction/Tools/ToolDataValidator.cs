using System.Collections.Generic;
using Core.Common;

namespace Interaction.Tools
{
    public sealed class ToolDataValidator : ScriptableObjectValidator<ToolData>
    {
        protected override void CollectConfigurationErrors(ToolData asset, List<ConfigurationError> errors)
        {
            if (asset.MaxCharge > 0 && (asset.ChargePerUsage <= 0 || asset.ChargePerUsage > asset.MaxCharge))
                Report(errors, asset, "chargePerUsage", "Charge per usage must be positive and fit within the tool's capacity.");
        }
    }
}

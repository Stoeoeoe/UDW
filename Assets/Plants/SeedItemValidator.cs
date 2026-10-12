using System.Collections.Generic;
using Core.Common;

namespace Plants
{
    public sealed class SeedItemValidator : ScriptableObjectValidator<SeedItem>
    {
        protected override void CollectConfigurationErrors(SeedItem asset, List<ConfigurationError> errors)
        {
            // All configuration rules are declared on the definition and its nested data.
        }
    }
}

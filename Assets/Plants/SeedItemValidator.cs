using System.Collections.Generic;
using Core.Common;

namespace Plants
{
    /// <summary>Runs attribute validation on seed definitions and their referenced plant data.</summary>
    public sealed class SeedItemValidator : ScriptableObjectValidator<SeedItem>
    {
        protected override void CollectConfigurationErrors(SeedItem asset, List<ConfigurationError> errors)
        {
            // All configuration rules are declared on the definition and its nested data.
        }
    }
}

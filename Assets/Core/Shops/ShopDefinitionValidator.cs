using System;
using System.Collections.Generic;
using Core.Common;

namespace Core.Shops
{
    public sealed class ShopDefinitionValidator : ScriptableObjectValidator<ShopDefinition>
    {
        protected override void CollectConfigurationErrors(ShopDefinition asset, List<ConfigurationError> errors)
        {
            if (asset.Offerings == null) return;
            var ids = new HashSet<string>(StringComparer.Ordinal);
            for (var i = 0; i < asset.Offerings.Count; i++)
            {
                var offering = asset.Offerings[i];
                if (offering == null) continue;
                var field = $"offerings[{i}]";
                if (DefinitionIdRules.IsPresent(offering.id) && !ids.Add(offering.id))
                    Report(errors, asset, field + ".id", "Offering IDs must be unique in this shop.");
                if (offering.maxStock < offering.minStock)
                    Report(errors, asset, field + ".maxStock", "Must be at least minStock.");
            }
        }
    }
}

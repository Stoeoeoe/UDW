using System;
using System.Collections.Generic;
using Core.Common;

namespace Core.Shops
{
    public sealed class ShopValidator : ScriptableObjectValidator<Shop>
    {
        protected override void CollectConfigurationErrors(Shop asset, List<ConfigurationError> errors)
        {
            if (asset.Offerings == null) return;
            var items = new HashSet<string>(StringComparer.Ordinal);
            for (var i = 0; i < asset.Offerings.Length; i++)
                if (asset.Offerings[i] != null && DefinitionIdRules.IsPresent(asset.Offerings[i].ItemId) && !items.Add(asset.Offerings[i].ItemId))
                    Report(errors, asset, $"Offerings[{i}].ItemId", "An item can be offered only once in a shop.");
        }
    }
}

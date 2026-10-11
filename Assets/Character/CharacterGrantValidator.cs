using System;
using System.Collections.Generic;
using Core.Common;
using Core.GameplayTags;

namespace Character
{
    internal static class CharacterGrantValidator
    {
        public static void CollectTags(ValidatedScriptableObject asset, IReadOnlyList<string> tags,
            string prefix, List<ConfigurationError> errors)
        {
            // Optional arrays mean no grants. Tag syntax is a domain rule, not a generic string constraint.
            if (tags == null) return;
            for (var i = 0; i < tags.Count; i++)
            {
                try { GameplayTag.Validate(tags[i]); }
                catch (ArgumentException exception)
                {
                    errors.Add(new ConfigurationError(asset, $"{prefix}grantedTags[{i}]", exception.Message));
                }
            }
        }
    }
}

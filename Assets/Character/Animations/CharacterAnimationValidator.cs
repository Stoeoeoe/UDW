using System.Collections.Generic;
using Core.Common;

namespace Character.Animations
{
    /// <summary>Checks set timing and one-shot completion contracts before animation definitions reach gameplay.</summary>
    public sealed class CharacterAnimationValidator : ScriptableObjectValidator<CharacterAnimationDefinition>
    {
        protected override void CollectConfigurationErrors(CharacterAnimationDefinition asset, List<ConfigurationError> errors)
        {
            if (asset is not CharacterAnimationSet set) return;
            var delay = set.VariationDelay;
            if (!ConfigurationRules.IsFinite(delay.x) || !ConfigurationRules.IsFinite(delay.y) ||
                delay.x <= 0 || delay.y < delay.x)
                Report(errors, asset, "variationDelay", "Use a positive, finite minimum and a maximum at least as large.");
            if (set.Variations == null) return; // Attribute validation reports missing collections and references.
            for (var i = 0; i < set.Variations.Count; i++)
            {
                var variation = set.Variations[i];
                if (variation == null || !variation.Animation || !variation.Animation.Clip) continue;
                var clip = variation.Animation.Clip;
                if (clip.isLooping || clip.length <= 0)
                    Report(errors, asset, $"variations[{i}]", "Variations require a non-looping clip with positive duration.");
            }
        }
    }
}

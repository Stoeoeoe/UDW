using System.Collections.Generic;
using Core.Common;

namespace Character.Animations
{
    /// <summary>Checks set timing and one-shot completion contracts before animation definitions reach gameplay.</summary>
    public sealed class CharacterAnimationValidator : ScriptableObjectValidator<CharacterAnimationDefinition>
    {
        protected override void CollectConfigurationErrors(CharacterAnimationDefinition asset, List<ConfigurationError> errors)
        {
            if (asset is CharacterAnimation animation)
            {
                bool usesMemao = !string.IsNullOrEmpty(animation.MemaoAction);
                if (usesMemao == (bool)animation.Clip)
                    Report(errors, asset, "clip", "Assign exactly one source: a fixed clip or a Memao action.");
                if (usesMemao && (string.IsNullOrWhiteSpace(animation.MemaoAction) || animation.MemaoAction.Trim() != animation.MemaoAction))
                    Report(errors, asset, "memaoAction", "Use an importer action name without surrounding whitespace.");
                return;
            }
            if (asset is CharacterActivityAnimation activity)
            {
                if (activity.Loop is CharacterActivityAnimation)
                    Report(errors, asset, "loop", "Use an animation or an animation set as the loop, not another activity.");
                ReportFiniteClip(errors, activity, "start", activity.Start);
                ReportFiniteClip(errors, activity, "end", activity.End);
                return;
            }
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

        /// <summary>Fixed clips are checked here; Memao actions are checked against the performer's library at playback.</summary>
        private static void ReportFiniteClip(List<ConfigurationError> errors, CharacterAnimationDefinition asset, string field,
            CharacterAnimation animation)
        {
            if (!animation || !animation.Clip) return;
            if (animation.Clip.isLooping || animation.Clip.length <= 0)
                Report(errors, asset, field, "Use a non-looping clip with positive duration.");
        }
    }
}

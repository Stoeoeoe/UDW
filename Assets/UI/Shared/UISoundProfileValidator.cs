using System.Collections.Generic;
using Core.Common;

namespace UI.Shared
{
    public sealed class UISoundProfileValidator : ScriptableObjectValidator<UISoundProfile>
    {
        protected override void CollectConfigurationErrors(UISoundProfile asset, List<ConfigurationError> errors)
        {
            if (asset.Sounds == null) return;
            var cues = new HashSet<UISoundCue>();
            for (var i = 0; i < asset.Sounds.Count; i++)
            {
                var sound = asset.Sounds[i];
                if (sound == null) continue;
                var field = $"sounds[{i}]";
                if (!cues.Add(sound.cue)) Report(errors, asset, field + ".cue", "Use each cue once per profile.");
                // Vector endpoints and their ordering are one combined configuration contract.
                if (!ConfigurationRules.IsFinite(sound.pitchRange.x) || !ConfigurationRules.IsFinite(sound.pitchRange.y) ||
                    sound.pitchRange.x < 0.01f || sound.pitchRange.y > 3 || sound.pitchRange.x > sound.pitchRange.y)
                    Report(errors, asset, field + ".pitchRange", "Must satisfy 0.01 <= minimum <= maximum <= 3 with finite values.");
            }
        }
    }
}

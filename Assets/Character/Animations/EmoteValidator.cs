using System.Collections.Generic;
using Core.Common;

namespace Character.Animations
{
    public sealed class EmoteValidator : ScriptableObjectValidator<EmoteDefinition>
    {
        protected override void CollectConfigurationErrors(EmoteDefinition asset, List<ConfigurationError> errors)
        {
            if (!asset.Animation && !asset.CalloutIcon)
                Report(errors, asset, "animation", "An emote requires an animation, a callout icon, or both.");
            if (asset.Animation)
                foreach (var error in asset.Animation.ValidateConfiguration())
                    Report(errors, asset, "animation." + error.Setting, error.Message);
            if (asset.Sound)
                foreach (var error in asset.Sound.ValidateConfiguration())
                    Report(errors, asset, "sound." + error.Setting, error.Message);
            if (!ConfigurationRules.IsFinite(asset.CalloutOffset.x) || !ConfigurationRules.IsFinite(asset.CalloutOffset.y))
                Report(errors, asset, "calloutOffset", "Callout offset must be finite.");
        }
    }
}

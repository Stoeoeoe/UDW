using System.Collections.Generic;
using Core.Common;

namespace Interaction.Dialog
{
    public sealed class TypewriterSoundValidator : ScriptableObjectValidator<TypewriterSound>
    {
        protected override void CollectConfigurationErrors(TypewriterSound asset, List<ConfigurationError> errors)
        {
            if (!ConfigurationRules.IsFinite(asset.pitchMin) || !ConfigurationRules.IsFinite(asset.pitchMax) ||
                asset.pitchMin < -3 || asset.pitchMax > 3 || asset.pitchMin > asset.pitchMax)
                Report(errors, asset, "pitchMin/pitchMax", "Must satisfy -3 <= minimum <= maximum <= 3 with finite values.");
        }
    }
}

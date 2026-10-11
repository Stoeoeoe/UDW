using System.Collections.Generic;
using Core.Common;

namespace Character
{
    public sealed class SkillDefinitionValidator : ScriptableObjectValidator<SkillDefinition>
    {
        protected override void CollectConfigurationErrors(SkillDefinition asset, List<ConfigurationError> errors)
        {
            if (asset.Levels == null) return;
            for (var i = 0; i < asset.Levels.Count; i++)
                if (asset.Levels[i] != null)
                    CharacterGrantValidator.CollectTags(asset, asset.Levels[i].GrantedTags, $"levels[{i}].", errors);
        }
    }
}

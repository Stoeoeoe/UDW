using System.Collections.Generic;
using Character;
using Core.Common;

namespace Core.Divinity
{
    public sealed class BoonDefinitionValidator : ScriptableObjectValidator<BoonDefinition>
    {
        protected override void CollectConfigurationErrors(BoonDefinition asset, List<ConfigurationError> errors) =>
            CharacterGrantValidator.CollectTags(asset, asset.GrantedTags, "", errors);
    }
}

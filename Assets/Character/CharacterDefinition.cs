using System.Collections.Generic;
using Core.Common;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Character
{
    /// <summary>Imported Vulcanus character identity, available without a prefab or loaded scene view.</summary>
    public sealed class CharacterDefinition : ValidatedScriptableObject<CharacterDefinitionValidator>
    {
        [SerializeField, ReadOnly, Validation.NamespacedId("The source requires a lowercase namespace:name ID.", Lowercase = true)] private string characterId;
        [SerializeField, ReadOnly, Validation.Required("The source requires a display name.")] private string displayName;
        [SerializeField, ReadOnly, Validation.Required("The source requires an icon.")] private string icon;
        public string CharacterId => characterId;
        public string DisplayName => displayName;
        public string Icon => icon;

#if UNITY_EDITOR
        public void Configure(string id, string characterName, string characterIcon)
        {
            characterId = id;
            displayName = characterName;
            icon = characterIcon;
            RequireValidConfiguration();
        }
#endif
    }

    public sealed class CharacterDefinitionValidator : ScriptableObjectValidator<CharacterDefinition>
    {
        protected override void CollectConfigurationErrors(CharacterDefinition asset, List<ConfigurationError> errors)
        {

        }
    }
}

using System.Collections.Generic;
using Core.Common;
using UnityEngine;

namespace Core.Scripting
{
    [CreateAssetMenu(menuName = "Game/Audio/Sound")]
    [Core.Catalogs.DefinitionResource]
    [Core.Scripting.LuaResource("sound")]
    public sealed class SoundDefinition : Core.Catalogs.DefinitionScriptableObject<SoundDefinitionValidator>
    {
        [SerializeField, Validation.Required("Assign the sound's audio clip.")] private AudioClip clip;
        public AudioClip Clip => clip;
    }

    public sealed class SoundDefinitionValidator : ScriptableObjectValidator<SoundDefinition>
    {
        protected override void CollectConfigurationErrors(SoundDefinition asset, List<ConfigurationError> errors)
        {
            if (asset.Clip && asset.Clip.length <= 0)
                Report(errors, asset, "clip", "Use a clip with positive duration.");
        }
    }
}

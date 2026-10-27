using System.Collections.Generic;
using Core.Common;
using UnityEngine;

namespace Core.Scripting
{
    [CreateAssetMenu(menuName = "Game/Audio/Sound")]
    public sealed class SoundDefinition : ValidatedScriptableObject<SoundDefinitionValidator>
    {
        [SerializeField, Validation.NamespacedId(Lowercase = true)] private string soundId;
        [SerializeField, Validation.Required("Assign the sound's audio clip.")] private AudioClip clip;
        public string Id => soundId;
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

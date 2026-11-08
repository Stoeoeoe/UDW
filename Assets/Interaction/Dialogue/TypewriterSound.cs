using Core.Common;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Interaction.Dialog
{
    [CreateAssetMenu(fileName = "TypewriterSound", menuName = "Game/Typewriter Sound", order = 6)]
    public class TypewriterSound : ValidatedScriptableObject<TypewriterSoundValidator>
    {
        [SerializeField, Required]
        [Validation.NamespacedId("Assign a lowercase namespace:name ID, such as base:fabia_voice.", Lowercase = true)]
        private string _soundId;

        [SerializeField, Validation.RequiredElements("Assign a clip or use an empty list for silence.")]
        private AudioClip[] _audioClips;

        [SerializeField]
        private float _pitchMin = 1.0f;

        [SerializeField]
        private float _pitchMax = 1.0f;

        public string Id => _soundId;
        public AudioClip[] audioClips => _audioClips;
        public float pitchMin => _pitchMin;
        public float pitchMax => _pitchMax;

    }
}

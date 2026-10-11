using Core.Common;
using PixelCrushers.DialogueSystem;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Interaction.Dialog
{
    [CreateAssetMenu(fileName = "TypewriterSound", menuName = "Game/Typewriter Sound", order = 6)]
    public class TypewriterSound : ValidatedScriptableObject<TypewriterSoundValidator>
    {
        [SerializeField, Required, ActorPopup]
        [Validation.Id("Assign a nonblank actor ID; catalog matching is case-insensitive.")]
        private string _actorId;

        [SerializeField, Validation.RequiredElements("Assign a clip or use an empty list for silence.")]
        private AudioClip[] _audioClips;

        [SerializeField]
        private float _pitchMin = 1.0f;

        [SerializeField]
        private float _pitchMax = 1.0f;

        public string ActorId => _actorId;
        public AudioClip[] audioClips => _audioClips;
        public float pitchMin => _pitchMin;
        public float pitchMax => _pitchMax;

    }
}

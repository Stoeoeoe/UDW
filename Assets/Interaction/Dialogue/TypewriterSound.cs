using Core.Common;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Interaction.Dialog
{
    [CreateAssetMenu(fileName = "TypewriterSound", menuName = "Game/Typewriter Sound", order = 6)]
    [Core.Catalogs.DefinitionResource]
    [Core.Scripting.LuaResource("typewriterSound")]
    public class TypewriterSound : Core.Catalogs.DefinitionScriptableObject<TypewriterSoundValidator>
    {

        [SerializeField, Validation.RequiredElements("Assign a clip or use an empty list for silence.")]
        private AudioClip[] _audioClips;

        [SerializeField]
        private float _pitchMin = 1.0f;

        [SerializeField]
        private float _pitchMax = 1.0f;
        public AudioClip[] audioClips => _audioClips;
        public float pitchMin => _pitchMin;
        public float pitchMax => _pitchMax;

    }
}

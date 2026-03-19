using PixelCrushers.DialogueSystem;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Interaction.Dialog
{
    [CreateAssetMenu(fileName = "TypewriterSound", menuName = "Game/Typewriter Sound", order = 6)]
    public class TypewriterSound : ScriptableObject
    {
        [Required, ActorPopup]
        public string ActorId;
        public AudioClip[] audioClips;
        public float pitchMin = 1.0f;
        public float pitchMax = 1.0f;
    }
}

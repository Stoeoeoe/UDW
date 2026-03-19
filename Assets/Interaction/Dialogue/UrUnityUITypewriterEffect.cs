using MoreMountains.Tools;
using PixelCrushers.DialogueSystem;
using UnityEngine;

namespace Interaction.Dialog
{
    public class UrUnityUITypewriterEffect : UnityUITypewriterEffect
    {
        public TypewriterSound DefaultTypewriterSound;

        protected override void PlayCharacterAudio()
        {
            var soundManager = MMSoundManager.Current;
            var currentActor = DialogueActor.GetDialogueActorComponent(DialogueManager.currentConversant).GetActorName();
            var sounds = DataManager.Current.TypewriterSounds;

            var typewriterSound = sounds.ContainsKey(currentActor) ? sounds[currentActor] : DefaultTypewriterSound;
            float pitch = Random.Range(typewriterSound.pitchMin, typewriterSound.pitchMax);
        
            this.audioClip = typewriterSound.audioClips[Random.Range(0, typewriterSound.audioClips.Length)];

            if (audioClip == null) return;

            if(this.audioSource && this.audioSource.isPlaying && interruptAudioClip)
            {
                soundManager.StopSound(audioSource);
            }

            if(!audioSource.isPlaying)
            {
                soundManager.PlaySound(audioClip, MMSoundManager.MMSoundManagerTracks.Sfx, Vector3.zero, pitch: pitch, recycleAudioSource: audioSource);
            }
        }

    }
}

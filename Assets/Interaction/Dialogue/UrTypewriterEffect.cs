using System.Collections.Generic;
using MoreMountains.Tools;
using PixelCrushers.DialogueSystem;
using UnityEngine;
using DialogueActor = PixelCrushers.DialogueSystem.Wrappers.DialogueActor;
using TextMeshProTypewriterEffect = PixelCrushers.DialogueSystem.Wrappers.TextMeshProTypewriterEffect;

namespace Interaction.Dialog
{
    public class UrTypewriterEffect : TextMeshProTypewriterEffect
    {
        protected TypewriterSound _currentTypeWriterSound;
        private AudioClip[] _currentClips;
        [SerializeField] protected TypewriterSound _defaultTypeWriterSound;

        public override void Awake()
        {
            base.Awake();
        }

        protected override void PlayCharacterAudio(char c)
        {
            if (_currentTypeWriterSound == null)
            {
                var currentActorName = DialogueManager.Instance.activeConversation.conversationModel.ActorInfo
                    .nameInDatabase;
                _currentTypeWriterSound = DataManager.Current.TypewriterSounds.GetValueOrDefault(currentActorName, _defaultTypeWriterSound);
                _currentClips = _currentTypeWriterSound.audioClips;
                // TODO: RESET AFTER CLOSE
            }

            if (_currentTypeWriterSound == null)
            {
                return;
            }
            float pitch = Random.Range(_currentTypeWriterSound.pitchMin, _currentTypeWriterSound.pitchMax);
            var clip = _currentClips[Random.Range(0, _currentClips.Length)];
            MMSoundManager.Current.PlaySound(clip, MMSoundManager.MMSoundManagerTracks.Sfx, Vector3.zero,
                pitch: pitch);

            // base.PlayCharacterAudio(c);
        }
    }
}
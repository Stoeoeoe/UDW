using Core.Common;
using System;
using UnityEngine;
using UnityEngine.Audio;

namespace UI.Shared
{
    public enum UISoundCue { Click, Open, Close, Denied }

    [CreateAssetMenu(menuName = "Game/UI/Sound Profile")]
    public sealed class UISoundProfile : ValidatedScriptableObject<UISoundProfileValidator>
    {
        [Serializable]
        public sealed class Sound
        {
            [Validation.DefinedEnum("Select a defined cue.")] public UISoundCue cue;
            [Tooltip("A random clip is chosen for each playback. An empty list deliberately silences this cue.")]
            [Validation.RequiredElements("Assign a clip or use an empty list for silence.")] public AudioClip[] clips = Array.Empty<AudioClip>();
            public AudioMixerGroup mixerGroup;
            [Validation.Range(0, 1)] public float volume = 1f;
            public Vector2 pitchRange = Vector2.one;
        }

        [Tooltip("Missing cues inherit the manager's defaults when this profile is used as a screen override.")]
        [SerializeField, Validation.Required("Must not be null; an empty array inherits all cues."), Validation.RequiredElements("Sound entry must not be null."), Validation.Nested]
        private Sound[] sounds = Array.Empty<Sound>();

        public System.Collections.Generic.IReadOnlyList<Sound> Sounds => sounds;

        public bool TryGet(UISoundCue cue, out Sound sound)
        {
            foreach (var entry in sounds)
                if (entry.cue == cue) { sound = entry; return true; }
            sound = null;
            return false;
        }
    }
}

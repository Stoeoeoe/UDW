using System;
using Character;

namespace Interaction.Dialog
{
    public sealed class TypewriterSoundResolver
    {
        private readonly CharacterCatalog _characters;
        private readonly TypewriterSoundCatalog _sounds;

        public TypewriterSoundResolver(CharacterCatalog characters, TypewriterSoundCatalog sounds)
        {
            _characters = characters;
            _sounds = sounds;
        }

        /// <summary>
        /// The speaker's sound for this emotion, else the speaker's default, else <paramref name="defaultSound"/>.
        /// Narrator lines and speakers without a character definition use the default.
        /// </summary>
        public TypewriterSound ResolveTypewriterSound(string speakerId, string emotionId, TypewriterSound defaultSound)
        {
            var soundId = string.IsNullOrEmpty(speakerId) ? null : _characters.Get(speakerId)?.TypewriterSoundIdFor(emotionId);
            if (soundId == null) return defaultSound;
            return _sounds.Get(soundId) ?? throw new InvalidOperationException($"Typewriter sound '{soundId}' is not registered and enabled.");
        }
    }
}

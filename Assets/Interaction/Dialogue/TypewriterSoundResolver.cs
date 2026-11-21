using Core.Catalogs;
using System;
using Character;

namespace Interaction.Dialog
{
    public sealed class TypewriterSoundResolver
    {
        private readonly DefinitionCatalog _catalog;

        public TypewriterSoundResolver(DefinitionCatalog catalog) => _catalog = catalog;

        /// <summary>
        /// The speaker's sound for this emotion, else the speaker's default, else <paramref name="defaultSound"/>.
        /// Narrator lines and speakers without a character definition use the default.
        /// </summary>
        public TypewriterSound ResolveTypewriterSound(string speakerId, string emotionId, TypewriterSound defaultSound)
        {
            var soundId = string.IsNullOrEmpty(speakerId) ? null : _catalog.Get<CharacterDefinition>(speakerId)?.TypewriterSoundIdFor(emotionId);
            if (soundId == null) return defaultSound;
            return _catalog.Get<TypewriterSound>(soundId) ?? throw new InvalidOperationException($"Typewriter sound '{soundId}' is not registered and enabled.");
        }
    }
}

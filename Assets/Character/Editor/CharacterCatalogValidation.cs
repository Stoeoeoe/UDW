using System;
using System.Collections.Generic;
using System.Linq;
using Core.Catalogs.Editor;
using Interaction.Dialog;

namespace Character.Editor
{
    /// <summary>Characters reference typewriter sounds authored elsewhere; catalog refresh checks that each one exists.</summary>
    internal static class CharacterCatalogValidation
    {
        public static void Validate(IEnumerable<CharacterDefinition> characters)
        {
            var soundIds = CatalogAssetDiscovery.Find("Assets", typeof(TypewriterSound)).Cast<TypewriterSound>().Select(sound => sound.Id).ToHashSet();
            foreach (var character in characters)
            {
                var referenced = character.EmotionTypewriterSounds.Select(each => each.soundId).Append(character.TypewriterSound);
                foreach (var soundId in referenced.Where(id => !string.IsNullOrEmpty(id)))
                    if (!soundIds.Contains(soundId))
                        throw new InvalidOperationException($"Character '{character.Id}' uses the unknown typewriter sound '{soundId}'.");
            }
        }
    }
}

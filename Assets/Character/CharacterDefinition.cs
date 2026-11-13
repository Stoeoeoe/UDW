using System;
using System.Collections.Generic;
using System.Linq;
using Core.Common;
using Sirenix.OdinInspector;
using UnityEngine;

namespace Character
{
    /// <summary>Imported Vulcanus character identity, available without a prefab or loaded scene view.</summary>
    public sealed class CharacterDefinition : ValidatedScriptableObject<CharacterDefinitionValidator>
    {
        [SerializeField, ReadOnly, Validation.NamespacedId("The source requires a lowercase namespace:name ID.", Lowercase = true)] private string characterId;
        [SerializeField, ReadOnly, Validation.Required("The source requires a display name.")] private string displayName;
        [SerializeField, ReadOnly, Tooltip("Typewriter sound used for this character's lines unless an emotion overrides it. Empty uses the dialogue's default.")]
        private string typewriterSoundId;
        [SerializeField, ReadOnly] private EmotionTypewriterSound[] emotionTypewriterSounds = Array.Empty<EmotionTypewriterSound>();
        [SerializeField, ReadOnly, Tooltip("Portrait shown when the character has none for a line's emotion.")]
        private Texture2D defaultPortrait;
        [SerializeField, ReadOnly] private EmotionPortrait[] emotionPortraits = Array.Empty<EmotionPortrait>();
        [SerializeField, ReadOnly, Tooltip("Walking speed in tiles per second, before boons and other modifiers.")]
        private float walkSpeed = DefaultWalkSpeed;

        /// <summary>Walk speed when the Vulcanus character leaves it out; Vulcanus documents the same value.</summary>
        public const float DefaultWalkSpeed = 4f;

        public string CharacterId => characterId;
        public float WalkSpeed => walkSpeed;
        public string DisplayName => displayName;
        public string DefaultTypewriterSoundId => typewriterSoundId;
        public IReadOnlyList<EmotionPortrait> EmotionPortraits => emotionPortraits;

        /// <summary>The portrait for a line with this emotion, else the default portrait; null when the character has none.</summary>
        public Texture2D PortraitFor(string emotionId)
        {
            var match = emotionPortraits.FirstOrDefault(each => each.emotionId == emotionId);
            return match != null ? match.portrait : defaultPortrait;
        }
        public IReadOnlyList<EmotionTypewriterSound> EmotionTypewriterSounds => emotionTypewriterSounds;

        /// <summary>The typewriter sound ID for a line with this emotion, or null when the character defines none.</summary>
        public string TypewriterSoundIdFor(string emotionId)
        {
            var match = emotionTypewriterSounds.FirstOrDefault(each => each.emotionId == emotionId);
            if (match != null) return match.soundId;
            return string.IsNullOrEmpty(typewriterSoundId) ? null : typewriterSoundId;
        }

#if UNITY_EDITOR
        public void Configure(string id, string characterName,
            string defaultTypewriterSoundId = null, EmotionTypewriterSound[] emotionSounds = null,
            Texture2D defaultPortraitTexture = null, EmotionPortrait[] emotionPortraitTextures = null,
            float walkTilesPerSecond = DefaultWalkSpeed)
        {
            characterId = id;
            displayName = characterName;
            typewriterSoundId = defaultTypewriterSoundId;
            emotionTypewriterSounds = emotionSounds ?? Array.Empty<EmotionTypewriterSound>();
            defaultPortrait = defaultPortraitTexture;
            emotionPortraits = emotionPortraitTextures ?? Array.Empty<EmotionPortrait>();
            walkSpeed = walkTilesPerSecond;
            RequireValidConfiguration();
        }
#endif
    }

    /// <summary>A portrait that replaces the character's default for lines with one emotion.</summary>
    [Serializable]
    public sealed class EmotionPortrait
    {
        public string emotionId;
        public Texture2D portrait;
    }

    /// <summary>A typewriter sound that replaces the character's default for lines with one emotion.</summary>
    [Serializable]
    public sealed class EmotionTypewriterSound
    {
        public string emotionId;
        public string soundId;
    }

    public sealed class CharacterDefinitionValidator : ScriptableObjectValidator<CharacterDefinition>
    {
        protected override void CollectConfigurationErrors(CharacterDefinition asset, List<ConfigurationError> errors)
        {
            if (!ConfigurationRules.IsFinite(asset.WalkSpeed) || asset.WalkSpeed <= 0f)
                Report(errors, asset, "walkSpeed", "Walk speed must be a positive number of tiles per second.");
            if (!string.IsNullOrEmpty(asset.DefaultTypewriterSoundId) && !DefinitionIdRules.IsLowercaseNamespaced(asset.DefaultTypewriterSoundId))
                Report(errors, asset, "typewriterSound", "Use a lowercase namespace:name typewriter sound ID.");
            var portraitEmotions = new HashSet<string>();
            foreach (var each in asset.EmotionPortraits)
            {
                if (!DefinitionIdRules.IsLowercaseNamespaced(each.emotionId))
                    Report(errors, asset, "emotionPortraits", "Emotion IDs must be lowercase namespace:name.");
                else if (!portraitEmotions.Add(each.emotionId))
                    Report(errors, asset, "emotionPortraits", $"Emotion '{each.emotionId}' has more than one portrait.");
                if (!each.portrait)
                    Report(errors, asset, "emotionPortraits", $"Emotion '{each.emotionId}' has no portrait image.");
            }
            var seen = new HashSet<string>();
            foreach (var each in asset.EmotionTypewriterSounds)
            {
                if (!DefinitionIdRules.IsLowercaseNamespaced(each.emotionId) || !DefinitionIdRules.IsLowercaseNamespaced(each.soundId))
                    Report(errors, asset, "emotionTypewriterSounds", "Emotion and sound IDs must be lowercase namespace:name.");
                else if (!seen.Add(each.emotionId))
                    Report(errors, asset, "emotionTypewriterSounds", $"Emotion '{each.emotionId}' has more than one typewriter sound.");
            }
        }
    }
}

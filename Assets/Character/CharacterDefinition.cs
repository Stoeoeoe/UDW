using System;
using System.Collections.Generic;
using System.Linq;
using Core.Common;
using Core.SocialStanding;
using Newtonsoft.Json;
using UnityEngine;

namespace Character
{
    /// <summary>Imported Vulcanus character identity, available without a prefab or loaded scene view.</summary>
    [ImportedData]
    [Core.Catalogs.DefinitionResource]
    public sealed class CharacterDefinition : Core.Catalogs.DefinitionScriptableObject<CharacterDefinitionValidator>
    {
        [field: SerializeField, Validation.Required("The source requires a display name.")] public string Name { get; private set; }
        /// <summary>Typewriter sound used for this character's lines unless an emotion overrides it. Empty uses the dialogue's default.</summary>
        [field: SerializeField] public string TypewriterSound { get; private set; }
        [field: SerializeField, JsonConverter(typeof(KeyedEntriesJsonConverter))]
        public EmotionTypewriterSound[] EmotionTypewriterSounds { get; private set; } = Array.Empty<EmotionTypewriterSound>();
        /// <summary>Portrait shown when the character has none for a line's emotion.</summary>
        [field: SerializeField] public Texture2D DefaultPortrait { get; private set; }
        [field: SerializeField, JsonConverter(typeof(KeyedEntriesJsonConverter))]
        public EmotionPortrait[] Portraits { get; private set; } = Array.Empty<EmotionPortrait>();
        /// <summary>Walking speed in tiles per second, before boons and other modifiers.</summary>
        [field: SerializeField] public float WalkSpeed { get; private set; } = DefaultWalkSpeed;
        /// <summary>How much this character thinks of the player in a new game, from 0 to 100.</summary>
        [field: SerializeField] public int StartingSocialStanding { get; private set; } = SocialStandingService.DefaultStanding;
        /// <summary>
        /// What talking to the character starts when no quest and no routine sets a dialogue: the first entry whose
        /// condition holds. With no match the character cannot be talked to.
        /// </summary>
        [field: SerializeField, Validation.Nested] public CharacterDialogue[] Dialogues { get; private set; } = Array.Empty<CharacterDialogue>();

        /// <summary>Walk speed when the Vulcanus character leaves it out; Vulcanus documents the same value.</summary>
        public const float DefaultWalkSpeed = 4f;

        /// <summary>The index in <see cref="Dialogues"/> of the first entry whose condition holds, or -1 if none does.</summary>
        /// <param name="holds">Evaluates a read-only Lua condition against the current game state.</param>
        public int DialogueIndexFor(Func<string, bool> holds)
        {
            for (var i = 0; i < Dialogues.Length; i++)
                if (string.IsNullOrWhiteSpace(Dialogues[i].Condition) || holds(Dialogues[i].Condition)) return i;
            return -1;
        }

        /// <summary>The ID of the first <see cref="Dialogues"/> entry whose condition holds, or null if none does.</summary>
        public string DialogueFor(Func<string, bool> holds)
        {
            var index = DialogueIndexFor(holds);
            return index < 0 ? null : Dialogues[index].Dialogue;
        }

        /// <summary>The portrait for a line with this emotion, else the default portrait; null when the character has none.</summary>
        public Texture2D PortraitFor(string emotionId)
        {
            var match = Portraits.FirstOrDefault(each => each.emotionId == emotionId);
            return match != null ? match.portrait : DefaultPortrait;
        }

        /// <summary>The typewriter sound ID for a line with this emotion, or null when the character defines none.</summary>
        public string TypewriterSoundIdFor(string emotionId)
        {
            var match = EmotionTypewriterSounds.FirstOrDefault(each => each.emotionId == emotionId);
            if (match != null) return match.soundId;
            return string.IsNullOrEmpty(TypewriterSound) ? null : TypewriterSound;
        }
    }

    /// <summary>A dialogue the character says while its condition holds.</summary>
    [Serializable, ImportedData]
    public sealed class CharacterDialogue
    {
        [field: SerializeField, Validation.Reference(typeof(Core.Dialogue.Vulcanus.VulcanusDialogueAsset))]
        public string Dialogue { get; private set; }
        /// <summary>Read-only Lua expression; empty means always.</summary>
        [field: SerializeField, Validation.LuaExpression] public string Condition { get; private set; }
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
            if (asset.StartingSocialStanding < SocialStandingService.Min || asset.StartingSocialStanding > SocialStandingService.Max)
                Report(errors, asset, "StartingSocialStanding", $"Starting social standing must be from {SocialStandingService.Min} to {SocialStandingService.Max}.");
            if (!ConfigurationRules.IsFinite(asset.WalkSpeed) || asset.WalkSpeed <= 0f)
                Report(errors, asset, "WalkSpeed", "Walk speed must be a positive number of tiles per second.");
            if (!string.IsNullOrEmpty(asset.TypewriterSound) && !DefinitionIdRules.IsLowercaseNamespaced(asset.TypewriterSound))
                Report(errors, asset, "TypewriterSound", "Use a lowercase namespace:name typewriter sound ID.");
            var portraitEmotions = new HashSet<string>();
            foreach (var each in asset.Portraits)
            {
                if (!DefinitionIdRules.IsLowercaseNamespaced(each.emotionId))
                    Report(errors, asset, "Portraits", "Emotion IDs must be lowercase namespace:name.");
                else if (!portraitEmotions.Add(each.emotionId))
                    Report(errors, asset, "Portraits", $"Emotion '{each.emotionId}' has more than one portrait.");
                if (!each.portrait)
                    Report(errors, asset, "Portraits", $"Emotion '{each.emotionId}' has no portrait image.");
            }
            var seen = new HashSet<string>();
            foreach (var each in asset.EmotionTypewriterSounds)
            {
                if (!DefinitionIdRules.IsLowercaseNamespaced(each.emotionId) || !DefinitionIdRules.IsLowercaseNamespaced(each.soundId))
                    Report(errors, asset, "EmotionTypewriterSounds", "Emotion and sound IDs must be lowercase namespace:name.");
                else if (!seen.Add(each.emotionId))
                    Report(errors, asset, "EmotionTypewriterSounds", $"Emotion '{each.emotionId}' has more than one typewriter sound.");
            }
        }
    }
}

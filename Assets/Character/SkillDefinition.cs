using System;
using System.Collections.Generic;
using Core.Common;
using Core.GameplayTags;
using UnityEngine;

namespace Character
{
    /// <summary>Player-facing skill details and its value at each level, starting with level zero.</summary>
    [CreateAssetMenu(fileName = "Skill Definition", menuName = "Game/Skills/Definition")]
    [Core.Catalogs.DefinitionResource("Assets/Resources/Skills", IdFormat = Core.Catalogs.DefinitionIdFormat.Namespaced)]
    public sealed class SkillDefinition : Core.Catalogs.DefinitionScriptableObject<SkillDefinitionValidator>
    {

        [SerializeField]
        private string _displayName;

        [SerializeField, TextArea(2, 4)]
        private string _description;

        [SerializeField]
        private Sprite _icon;

        [Tooltip("Include level zero (before the skill is upgraded) as the first entry.")]
        [SerializeField, Validation.NotEmpty("Provide at least level zero."), Validation.RequiredElements("Level must not be null."), Validation.Nested]
        private SkillLevelDefinition[] levels = { new SkillLevelDefinition() };
        public string DisplayName => _displayName;
        public string Description => _description;
        public Sprite Icon => _icon;
        public IReadOnlyList<SkillLevelDefinition> Levels => levels;
        public int MaxLevel => levels.Length - 1;

        public SkillLevelDefinition GetLevelDefinition(int level)
        {
            return levels[Mathf.Clamp(level, 0, levels.Length - 1)];
        }

        public float GetValueAtLevel(int level)
        {
            return GetLevelDefinition(level).Value;
        }
    }

    [Serializable]
    public sealed class SkillLevelDefinition
    {
        [SerializeField, Validation.Finite]
        private float value;
        [SerializeField]
        private string title;
        [TextArea(2, 4)] [SerializeField]
        private string description;
        [Tooltip("Tags granted at this level and retained at higher levels.")]
        [GameplayTagPicker]
        [SerializeField]
        private string[] grantedTags = Array.Empty<string>();
        [SerializeField, Validation.RequiredElements("Bonus must not be null."), Validation.Nested]
        private AttributeBonus[] attributeBonuses = Array.Empty<AttributeBonus>();

        public float Value => value;
        public string Title => title;
        public string Description => description;
        public string[] GrantedTags => grantedTags;
        public AttributeBonus[] AttributeBonuses => attributeBonuses;
        public CharacterGrant Grant => new(grantedTags, attributeBonuses);

    }
}

using System;
using Core.GameplayTags;
using UnityEngine;

namespace Character
{
    /// <summary>Player-facing skill details and its value at each level, starting with level zero.</summary>
    [CreateAssetMenu(fileName = "Skill Definition", menuName = "Game/Skills/Definition")]
    public sealed class SkillDefinition : ScriptableObject
    {
        [Tooltip("Stable namespaced ID, for example base:hammer_mastery. Do not change after saving games with this skill.")]
        [SerializeField] private string skillId;
        [SerializeField] private string displayName;
        [TextArea(2, 4)] [SerializeField] private string description;
        [SerializeField] private Sprite icon;
        [Tooltip("Include level zero (before the skill is upgraded) as the first entry.")]
        [SerializeField] private SkillLevelDefinition[] levels = { new SkillLevelDefinition() };

        public string SkillId => skillId;
        public string DisplayName => displayName;
        public string Description => description;
        public Sprite Icon => icon;
        public int MaxLevel => levels == null ? 0 : Mathf.Max(0, levels.Length - 1);

        public SkillLevelDefinition GetLevelDefinition(int level)
        {
            if (levels == null || levels.Length == 0)
                return null;

            return levels[Mathf.Clamp(level, 0, levels.Length - 1)];
        }

        public float GetValueAtLevel(int level)
        {
            return GetLevelDefinition(level)?.Value ?? 0f;
        }
    }

    [Serializable]
    public sealed class SkillLevelDefinition
    {
        [SerializeField] private float value;
        [SerializeField] private string title;
        [TextArea(2, 4)] [SerializeField] private string description;
        [Tooltip("Tags granted at this level and retained at higher levels.")]
        [GameplayTagPicker]
        [SerializeField] private string[] grantedTags = Array.Empty<string>();
        [SerializeField] private AttributeBonus[] attributeBonuses = Array.Empty<AttributeBonus>();

        public float Value => value;
        public string Title => title;
        public string Description => description;
        public string[] GrantedTags => grantedTags;
        public AttributeBonus[] AttributeBonuses => attributeBonuses;

        public CharacterGrant Grant => new(grantedTags, attributeBonuses);
    }
}

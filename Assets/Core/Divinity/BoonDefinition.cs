using System;
using System.Collections.Generic;
using Character;
using Core.GameplayTags;
using UnityEngine;

namespace Core.Divinity
{
    [CreateAssetMenu(fileName = "Boon", menuName = "Game/Divine Favour/Boon")]
    public sealed class BoonDefinition : ScriptableObject
    {
        [SerializeField] private string displayName;
        [TextArea(2, 4)] [SerializeField] private string description;
        [SerializeField] private Sprite icon;
        [GameplayTagPicker] [SerializeField] private string[] grantedTags = Array.Empty<string>();
        [SerializeField] private AttributeBonus[] attributes = Array.Empty<AttributeBonus>();

        public string DisplayName => displayName;
        public string Description => description;
        public Sprite Icon => icon;
        public IReadOnlyList<string> GrantedTags => grantedTags;
        public IReadOnlyList<AttributeBonus> Attributes => attributes;

        private CharacterGrant Grant => new(grantedTags, attributes);

        internal void Apply(GameCharacter character, string source)
            => Grant.Apply(character, source);

        internal void Remove(GameCharacter character, string source)
            => Grant.Remove(character, source);
    }
}

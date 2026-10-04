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
        [GameplayTagPicker] [SerializeField] private string[] grantedTags;
        [SerializeField] private AttributeBonus[] attributes;

        public string DisplayName => displayName;
        public string Description => description;
        public Sprite Icon => icon;
        public IReadOnlyList<string> GrantedTags => grantedTags ?? Array.Empty<string>();
        public IReadOnlyList<AttributeBonus> Attributes => attributes ?? Array.Empty<AttributeBonus>();

        [NonSerialized] private CharacterGrant? _grant;
        private CharacterGrant Grant => _grant ??= new CharacterGrant(grantedTags, attributes);

        private void OnEnable() => _grant = null;
#if UNITY_EDITOR
        private void OnValidate() => _grant = null;
#endif

        internal void Apply(GameCharacter character, string source)
            => Grant.Apply(character, source);

        internal void Remove(GameCharacter character, string source)
            => Grant.Remove(character, source);
    }
}

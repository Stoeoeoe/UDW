using Core.Common;
using System;
using System.Collections.Generic;
using Character;
using Core.GameplayTags;
using UnityEngine;

namespace Core.Divinity
{
    [CreateAssetMenu(fileName = "Boon", menuName = "Game/Divine Favour/Boon")]
    public sealed class BoonDefinition : ValidatedScriptableObject<BoonDefinitionValidator>
    {
        [SerializeField]
        private string _displayName;

        [SerializeField, TextArea(2, 4)]
        private string _description;

        [SerializeField]
        private Sprite _icon;

        [SerializeField, GameplayTagPicker]
        private string[] grantedTags;
        [SerializeField, Validation.RequiredElements("Bonus must not be null."), Validation.Nested]
        private AttributeBonus[] attributes;

        public string DisplayName => _displayName;
        public string Description => _description;
        public Sprite Icon => _icon;
        public IReadOnlyList<string> GrantedTags => grantedTags ?? Array.Empty<string>();
        public IReadOnlyList<AttributeBonus> Attributes => attributes ?? Array.Empty<AttributeBonus>();

        [NonSerialized]
        private CharacterGrant? _grant;
        private CharacterGrant Grant => _grant ??= new CharacterGrant(grantedTags, attributes);

        private void OnEnable() => _grant = null;
#if UNITY_EDITOR
        protected override void OnValidate()
        {
            _grant = null;
            base.OnValidate();
        }
#endif

        internal void Apply(GameCharacter character, string source)
            => Grant.Apply(character, source);

        internal void Remove(GameCharacter character, string source)
            => Grant.Remove(character, source);
    }
}

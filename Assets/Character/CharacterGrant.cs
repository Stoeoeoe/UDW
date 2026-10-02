using System;
using Core.GameplayTags;
using UnityEngine;

namespace Character
{
    /// <summary>Tags and attribute bonuses supplied by one active source.</summary>
    public readonly struct CharacterGrant
    {
        private readonly string[] _tags;
        private readonly AttributeBonus[] _attributes;

        public CharacterGrant(string[] tags, AttributeBonus[] attributes)
        {
            _tags = tags;
            _attributes = attributes;
        }

        public void Apply(GameCharacter character, string source)
        {
            character.Tags.SetSourceTags(source, _tags ?? Array.Empty<string>());
            if (_attributes == null) return;
            for (var i = 0; i < _attributes.Length; i++)
                _attributes[i].Apply(character, source + ":" + i);
        }

        public void Remove(GameCharacter character, string source)
        {
            character.Tags.RemoveSource(source);
            if (_attributes == null) return;
            for (var i = 0; i < _attributes.Length; i++)
                _attributes[i].Remove(character, source + ":" + i);
        }
    }

    [Serializable]
    public sealed class AttributeBonus
    {
        [SerializeField] private CharacterAttributeType attribute;
        [SerializeField] private float flat;
        [Tooltip("0.1 means a ten percent bonus. Percentages add together.")]
        [SerializeField] private float percent;

        public CharacterAttributeType Attribute => attribute;
        public float Flat => flat;
        public float Percent => percent;

        internal void Apply(GameCharacter character, string source) =>
            character.SetAttributeModifier(attribute, source, flat, percent);

        internal void Remove(GameCharacter character, string source) =>
            character.RemoveAttributeModifier(attribute, source);
    }
}

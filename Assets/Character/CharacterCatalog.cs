using System;
using Core.Catalogs;
using UnityEngine;

namespace Character
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Characters")]
    [DefaultCatalog(ResourceName)]
    public sealed class CharacterCatalog : DefinitionCatalog<CharacterDefinition>
    {
        public const string ResourceName = "CharacterCatalog";
        public override string Path => "Assets";
        protected override string GetDefinitionId(CharacterDefinition definition) => definition.Id;

        public CharacterDefinition Require(string id)
        {
            return Get(id) ?? throw new InvalidOperationException($"Character '{id}' is not registered and enabled.");
        }
    }
}

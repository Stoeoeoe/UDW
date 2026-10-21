using System;
using Core.Catalogs;
using UnityEngine;

namespace Character
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Characters")]
    public sealed class CharacterCatalog : DefinitionCatalog<CharacterDefinition>
    {
        public const string ResourceName = "CharacterCatalog";
        public override string Path => "Assets";
        protected override string GetDefinitionId(CharacterDefinition definition) => definition.CharacterId;

        public static CharacterDefinition Require(string id)
        {
            var catalog = CatalogResources.Load<CharacterCatalog>(ResourceName);
            if (!catalog) throw new InvalidOperationException("The required CharacterCatalog is missing.");
            return catalog.Get(id) ?? throw new InvalidOperationException($"Character '{id}' is not registered and enabled.");
        }
    }
}

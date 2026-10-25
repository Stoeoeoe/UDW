using System;
using Core.Catalogs;
using UnityEngine;

namespace Character.Animations
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Character Animations")]
    public sealed class CharacterAnimationCatalog : DefinitionCatalog<CharacterAnimationDefinition>
    {
        public const string ResourceName = "CharacterAnimationCatalog";
        public override string Path => "Assets";
        protected override string GetDefinitionId(CharacterAnimationDefinition definition) => definition.Id;

        public static CharacterAnimation RequireOneShot(string id)
        {
            var catalog = CatalogResources.Load<CharacterAnimationCatalog>(ResourceName);
            if (!catalog) throw new InvalidOperationException("The required CharacterAnimationCatalog is missing.");
            var definition = catalog.Get(id);
            if (!definition) throw new InvalidOperationException($"Animation '{id}' is not registered and enabled.");
            if (definition is not CharacterAnimation animation)
                throw new InvalidOperationException($"Animation '{id}' is a set; PlayAnimation requires a single finite animation.");
            return animation;
        }
    }
}

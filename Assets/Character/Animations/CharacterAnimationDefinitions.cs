using System;
using Core.Catalogs;

namespace Character.Animations
{
    public static class CharacterAnimationDefinitions
    {
        public static CharacterAnimation RequireOneShot(this DefinitionCatalog catalog, string id)
        {
            var definition = catalog.Require<CharacterAnimationDefinition>(id);
            if (definition is not CharacterAnimation animation)
                throw new InvalidOperationException($"Animation '{id}' is a set or an activity; PlayAnimation requires a single finite animation.");
            return animation;
        }
    }
}

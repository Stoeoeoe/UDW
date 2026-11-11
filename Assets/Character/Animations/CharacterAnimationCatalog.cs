using System;
using Core.Catalogs;
using Core.Scripting;
using UnityEngine;

namespace Character.Animations
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Character Animations")]
    [DefaultCatalog(ResourceName)]
    [LuaResource("animation")]
    public sealed class CharacterAnimationCatalog : DefinitionCatalog<CharacterAnimationDefinition>
    {
        public const string ResourceName = "CharacterAnimationCatalog";
        public override string Path => "Assets";
        protected override string GetDefinitionId(CharacterAnimationDefinition definition) => definition.Id;

        public CharacterAnimation RequireOneShot(string id)
        {
            var definition = Get(id);
            if (!definition) throw new InvalidOperationException($"Animation '{id}' is not registered and enabled.");
            if (definition is not CharacterAnimation animation)
                throw new InvalidOperationException($"Animation '{id}' is a set or an activity; PlayAnimation requires a single finite animation.");
            return animation;
        }
    }
}

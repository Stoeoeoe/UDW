using System;
using Core.Catalogs;
using Core.Scripting;
using UnityEngine;

namespace Character.Animations
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Emotes")]
    [DefaultCatalog(ResourceName)]
    [LuaResource("emote")]
    public sealed class EmoteCatalog : DefinitionCatalog<EmoteDefinition>
    {
        public const string ResourceName = "EmoteCatalog";
        public override string Path => "Assets";
        protected override string GetDefinitionId(EmoteDefinition definition) => definition.Id;

        public EmoteDefinition Require(string id)
        {
            var definition = Get(id);
            if (!definition) throw new InvalidOperationException($"Emote '{id}' is not registered and enabled.");
            return definition;
        }
    }
}

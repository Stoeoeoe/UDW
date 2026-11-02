using System;
using Core.Catalogs;
using UnityEngine;

namespace Character.Animations
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Emotes")]
    [DefaultCatalog(EmoteCatalog.ResourceName)]
    [Core.Scripting.LuaResource("emote")]
    public sealed class EmoteCatalog : DefinitionCatalog<EmoteDefinition>
    {
        public const string ResourceName = "EmoteCatalog";
        public override string Path => "Assets";
        protected override string GetDefinitionId(EmoteDefinition definition) => definition.Id;

        public static EmoteDefinition Require(string id)
        {
            var catalog = CatalogResources.Load<EmoteCatalog>(ResourceName);
            if (!catalog) throw new InvalidOperationException("The required EmoteCatalog is missing.");
            var definition = catalog.Get(id);
            if (!definition) throw new InvalidOperationException($"Emote '{id}' is not registered and enabled.");
            return definition;
        }
    }
}

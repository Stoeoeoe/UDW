using System;
using Core.Catalogs;
using UnityEngine;

namespace Interaction.Dialog
{
    [CreateAssetMenu(menuName = "Game/Catalogs/Typewriter Sounds")]
    public sealed class TypewriterSoundCatalog : DefinitionCatalog<TypewriterSound>
    {
        public const string ResourceName = "TypewriterSoundCatalog";
        public override string Path => "Assets";
        public override StringComparer IdComparer => StringComparer.OrdinalIgnoreCase;
        protected override string GetDefinitionId(TypewriterSound definition) => definition.ActorId;
    }
}

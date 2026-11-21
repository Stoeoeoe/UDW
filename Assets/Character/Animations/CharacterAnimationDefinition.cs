using Core.Common;
using UnityEngine;

namespace Character.Animations
{
    /// <summary>Identifies an authored animation or animation set; assets hold no character playback state.</summary>
    [Core.Catalogs.DefinitionResource]
    [Core.Scripting.LuaResource("animation")]
    public abstract class CharacterAnimationDefinition : Core.Catalogs.DefinitionScriptableObject<CharacterAnimationValidator>
    {
        public abstract CharacterAnimation BaseAnimation { get; }
    }
}

using Core.Common;
using UnityEngine;

namespace Character.Animations
{
    /// <summary>Identifies an authored animation or animation set; assets hold no character playback state.</summary>
    public abstract class CharacterAnimationDefinition : ValidatedScriptableObject<CharacterAnimationValidator>
    {
        [SerializeField, Validation.NamespacedId(Lowercase = true)]
        private string animationId;

        public string Id => animationId;
        public abstract CharacterAnimation BaseAnimation { get; }
    }
}

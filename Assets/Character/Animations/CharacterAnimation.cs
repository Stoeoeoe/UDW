using Core.Common;
using UnityEngine;

namespace Character.Animations
{
    /// <summary>A reusable clip definition; the clip's authored loop setting controls playback.</summary>
    [CreateAssetMenu(menuName = "Game/Character/Animation")]
    public sealed class CharacterAnimation : CharacterAnimationDefinition
    {
        [SerializeField, Validation.Required]
        private AnimationClip clip;

        public AnimationClip Clip => clip;
        public override CharacterAnimation BaseAnimation => this;
    }
}

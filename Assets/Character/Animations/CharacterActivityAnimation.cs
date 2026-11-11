using Core.Common;
using UnityEngine;

namespace Character.Animations
{
    /// <summary>
    /// An activity pose with an optional finite start, a held loop and an optional finite end, such as sitting down,
    /// reading and standing up. Play it with <see cref="UrCharacterAnimator.PlayActivity"/>.
    /// </summary>
    [CreateAssetMenu(menuName = "Game/Character/Activity Animation")]
    public sealed class CharacterActivityAnimation : CharacterAnimationDefinition
    {
        [SerializeField, Tooltip("Optional finite animation played once before the loop.")]
        private CharacterAnimation start;
        [SerializeField, Validation.ValidReference, Tooltip("Held until the activity ends: an animation or an animation set with variations.")]
        private CharacterAnimationDefinition loop;
        [SerializeField, Tooltip("Optional finite animation played once when the activity ends.")]
        private CharacterAnimation end;

        public CharacterAnimation Start => start;
        public CharacterAnimationDefinition Loop => loop;
        public CharacterAnimation End => end;
        public override CharacterAnimation BaseAnimation => loop.BaseAnimation;
    }
}

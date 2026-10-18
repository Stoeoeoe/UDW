using Core.Common;
using System;
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

        /// <summary>Checks a caller's finite, non-looping playback contract before gameplay.</summary>
        public void ValidateAsOneShot()
        {
            var errors = ValidateConfiguration();
            if (errors.Count > 0) throw new InvalidOperationException(string.Join("\n", errors));
            if (clip.isLooping || clip.length <= 0f)
                throw new InvalidOperationException($"Animation '{name}' requires a non-looping clip with positive duration.");
        }
    }
}

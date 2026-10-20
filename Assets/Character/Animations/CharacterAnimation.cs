using Core.Common;
using System;
using UnityEngine;

namespace Character.Animations
{
    /// <summary>A fixed clip or a directional Memao action resolved against the performing character's library.</summary>
    [CreateAssetMenu(menuName = "Game/Character/Animation")]
    public sealed class CharacterAnimation : CharacterAnimationDefinition
    {
        [SerializeField, Tooltip("Assign a fixed clip, or leave empty and specify a Memao action below.")]
        private AnimationClip clip;
        [SerializeField, Tooltip("Importer action without a direction suffix, e.g. Sit, Read or Downed. Leave empty for a fixed clip.")]
        private string memaoAction;

        public AnimationClip Clip => clip;
        public string MemaoAction => memaoAction;
        public override CharacterAnimation BaseAnimation => this;

        public AnimationClip ResolveClip(MemaoAnimationLibrary library, Vector2 facing)
        {
            ValidateDefinition();
            if (string.IsNullOrEmpty(memaoAction)) return clip;
            if (!library) throw new InvalidOperationException($"Animation '{name}' requires a Memao animation library.");
            return library.GetDirectional(memaoAction, facing);
        }

        private void ValidateDefinition()
        {
            var errors = ValidateConfiguration();
            if (errors.Count > 0) throw new InvalidOperationException(string.Join("\n", errors));
        }

        /// <summary>Checks a caller's finite, non-looping playback contract before gameplay.</summary>
        public void ValidateAsOneShot(MemaoAnimationLibrary library = null)
        {
            ValidateDefinition();
            if (!string.IsNullOrEmpty(memaoAction))
            {
                if (!library) throw new InvalidOperationException($"Animation '{name}' requires a Memao animation library.");
                library.ValidateOneShotAction(memaoAction);
                return;
            }
            if (clip.isLooping || clip.length <= 0f)
                throw new InvalidOperationException($"Animation '{name}' requires a non-looping clip with positive duration.");
        }
    }
}

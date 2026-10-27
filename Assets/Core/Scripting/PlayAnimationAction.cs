using System;
using Character;
using Character.Animations;

namespace Core.Scripting
{
    /// <summary>Waits for one-shot playback. The surrounding cutscene owns character control.</summary>
    public sealed class PlayAnimationAction : ILuaAction
    {
        private readonly UrCharacterAnimator.OneShotPlayback _playback;

        public PlayAnimationAction(GameCharacter character, CharacterAnimation animation, bool holdLastFrame = false) =>
            _playback = character.Animator.PlayOneShot(animation, holdLastFrame);

        public bool IsCompleted => _playback.IsCompleted;
        public void Tick(float deltaTime)
        {
            if (_playback.IsInterrupted)
                throw new InvalidOperationException("The character's animation was interrupted before completion.");
        }

        public void Dispose() => _playback.Dispose();
    }
}

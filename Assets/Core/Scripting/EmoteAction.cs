using System;
using Character;
using Character.Animations;
using MoreMountains.Tools;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>The session owns the emote's duration, animation claim and character-attached callout.</summary>
    public sealed class EmoteAction : ILuaAction
    {
        private readonly GameCharacter _character;
        private readonly UrCharacterAnimator.TimedPlayback _animation;
        private GameObject _callout;
        private float _remaining;
        private double _pauseRemaining;

        public static void ValidateDuration(double durationSeconds)
        {
            if (!double.IsFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > float.MaxValue)
                throw new ArgumentOutOfRangeException(nameof(durationSeconds), "Emote duration must be finite and nonnegative; zero uses the definition's default duration.");
        }

        public EmoteAction(GameCharacter character, EmoteDefinition emote, double durationSeconds = 0, double pauseAfterSeconds = 0)
        {
            ValidateDuration(durationSeconds);
            CutsceneLuaApi.ValidateWait(pauseAfterSeconds);
            _character = character;
            _remaining = durationSeconds == 0 ? emote.Duration : (float)durationSeconds;
            _pauseRemaining = pauseAfterSeconds;
            var calloutLayer = emote.CalloutIcon
                ? character.Graphics.GetComponentInChildren<SpriteRenderer>().sortingLayerID : 0;
            if (emote.Animation)
            {
                var animation = emote.Animation;
                var key = string.IsNullOrEmpty(animation.MemaoAction) ? null
                    : MemaoAnimationLibrary.DirectionalName(animation.MemaoAction, character.Orientation.FacingDirection);
                if (key != null && !character.Animator.AnimationLibrary.TryGet(key, out _))
                    Debug.LogWarning($"Emote '{emote.Id}': character '{character.CharacterId}' has no animation '{key}'; continuing without the animation.", character);
                else _animation = character.Animator.PlayTimedAnimation(animation, emote.PlaybackSpeed);
            }

            if (emote.CalloutIcon)
            {
                _callout = new GameObject("Emote callout");
                _callout.transform.SetParent(character.Graphics, false);
                _callout.transform.localPosition = emote.CalloutOffset;
                var renderer = _callout.AddComponent<SpriteRenderer>();
                renderer.sprite = emote.CalloutIcon;
                renderer.sortingLayerID = calloutLayer;
                renderer.sortingOrder = short.MaxValue;
            }

            if (emote.Sound)
            {
                var options = MMSoundManagerPlayOptions.Default;
                options.MmSoundManagerTrack = MMSoundManager.MMSoundManagerTracks.Sfx;
                options.Location = character.Graphics.position;
                options.SpatialBlend = 1f;
                options.Loop = false;
                MMSoundManager.Current.PlaySound(emote.Sound.Clip, options);
            }
        }

        public bool IsCompleted => _remaining <= 0f && _pauseRemaining <= 0;

        public void Tick(float deltaTime)
        {
            if (_remaining <= 0f)
            {
                _pauseRemaining -= deltaTime;
                return;
            }
            if (!_character.isActiveAndEnabled)
                throw new InvalidOperationException("The emoting character has left the live world.");
            if (_animation != null && _animation.IsInterrupted)
                throw new InvalidOperationException("The character's emote animation was interrupted before completion.");
            _remaining -= deltaTime;
            if (_remaining <= 0f)
            {
                Dispose();
                _pauseRemaining += _remaining;
            }
        }

        public void Dispose()
        {
            _animation?.Dispose();
            if (_callout)
            {
                _callout.SetActive(false);
                UnityEngine.Object.Destroy(_callout);
                _callout = null;
            }
        }
    }
}

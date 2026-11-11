using System;
using Animancer;
using Character.Animations;
using Core.Location;
using Interaction;
using Interaction.Tools;
using Plants;
using Sirenix.OdinInspector;
using UnityEngine;
using Random = UnityEngine.Random;

namespace Character
{
    /// <summary>Plays locomotion, tool animations and occupied animation sets, with playback state owned per character.</summary>
    public class UrCharacterAnimator : MonoBehaviour
    {
        [SerializeField] private NamedAnimancerComponent animancer;
        [SerializeField] private GameCharacter character;
        [SerializeField] private MemaoAnimationLibrary animationLibrary;
        public MemaoAnimationLibrary AnimationLibrary => animationLibrary;
        [Tooltip("Optional activity played whenever this character enters a location, e.g. for decorative NPCs. " +
                 "It is not resumed after another animation interrupts it.")]
        [SerializeField] private CharacterActivityAnimation activityOnEnter;
        private ActivityPlayback _activityOnEnterPlayback;
        [Header("Memao Actions")]
        [SerializeField] private string runPrefix = "Run";
        [SerializeField] private string walkPrefix = "Walk";
        [SerializeField] private string idlePrefix = "Idle";
        [Tooltip("Memao has no preparation sequence; hold its idle animation unless the tool supplies a clip.")]
        [SerializeField] private string toolPrepareAction = "Idle";
        [Tooltip("Default Memao tool action when the tool has no directional clip override.")]
        [SerializeField] private string toolUseAction = "Mine";
        private bool _isBound;
        private AnimancerState _namedState;
        private bool _namedAnimationActive;
        private ActionExecutor _actions;
        private bool _interactionAnimationActive;
        private CharacterAnimationSet _interactionSet;
        private AnimancerState _interactionState;
        private bool _playingVariation;
        private float _variationDelay;
        private Vector2 _interactionFacing;
        private OneShotPlayback _oneShot;
        private TimedPlayback _timedPlayback;
        private ActivityPlayback _activity;
        private bool _holdingLastFrame;
        internal OneShotPlayback HeldPlayback => _holdingLastFrame ? _oneShot : null;

        private void Awake() => ValidateConfiguration();

        public void ValidateConfiguration()
        {
            if (!animancer || !character || !animationLibrary)
                throw new InvalidOperationException($"Animator '{name}' requires Animancer, its character and a Memao library.");
            if (animancer.PlayAutomatically || animancer.Animations is { Length: > 0 })
                throw new InvalidOperationException($"Animator '{name}' owns playback through its Memao library. Disable automatic playback and clear Named Animancer's preloaded animations.");
            animationLibrary.ValidateAction(idlePrefix);
            animationLibrary.ValidateAction(walkPrefix);
            animationLibrary.ValidateAction(runPrefix);
            if (character.PerformPrimaryAction)
            {
                animationLibrary.ValidateAction(toolPrepareAction);
                animationLibrary.ValidateAction(toolUseAction, oneShot: true);
            }
            if (character.GetComponentInChildren<PlantSeedAction>(true))
                animationLibrary.ValidateAction(PlantSeedAction.AnimationAction, oneShot: true);
            if (activityOnEnter)
            {
                var errors = activityOnEnter.ValidateConfiguration();
                if (errors.Count > 0) throw new InvalidOperationException(string.Join("\n", errors));
            }
        }
        private void OnDisable()
        {
            EndNamedAnimation();
            EndInteractionAnimation();
            Unbind();
        }
        private void Update()
        {
            if (_namedAnimationActive && _namedState.NormalizedTime >= 1f)
            {
                _namedAnimationActive = false;
                _namedState = null;
                RefreshAnimation();
            }
            _activity?.Advance();
            if (!_interactionSet) return; // Single animations and sets without variations need no scheduling.
            if (_playingVariation)
            {
                if (_interactionState.NormalizedTime < 1f) return;
                PlayInteractionBase(_interactionSet.BaseAnimation);
                return;
            }
            _variationDelay -= Time.deltaTime;
            if (_variationDelay > 0f) return;
            _interactionState = PlayClip(_interactionSet.SelectVariation(Random.value)
                .ResolveClip(animationLibrary, _interactionFacing));
            _interactionState.Time = 0;
            _playingVariation = true;
        }
        private void Bind()
        {
            if (_isBound) return;
            ValidateConfiguration();
            character.OnMovementStateChanged += OnMovementStateChanged;
            character.Orientation.OnFacingDirectionChanged += OnFacingDirectionChanged;
            // Only characters with the optional primary-action ability have tool presentation.
            if (character.PerformPrimaryAction)
            {
                _actions = character.PerformPrimaryAction.ActionExecutor
                    ?? throw new InvalidOperationException("Primary actions must initialize before animation binding.");
                _actions.StateChanged += RefreshAnimation;
            }
            _isBound = true;
        }
        private void Unbind()
        {
            if (!_isBound) return;
            if (character)
            {
                character.OnMovementStateChanged -= OnMovementStateChanged;
                character.Orientation.OnFacingDirectionChanged -= OnFacingDirectionChanged;
            }
            if (_actions != null) _actions.StateChanged -= RefreshAnimation;
            _actions = null;
            _isBound = false;
        }
        private void OnFacingDirectionChanged(Vector2 direction) => RefreshAnimation();
        private void OnMovementStateChanged(MovementState state)
        {
            if (_holdingLastFrame && state is MovementState.Walking or MovementState.Running)
                EndInteractionAnimation();
            RefreshAnimation();
        }
        private void RefreshAnimation()
        {
            if (_holdingLastFrame && _actions != null && _actions.CurrentAction is UseToolAction)
                EndInteractionAnimation();
            if (_interactionAnimationActive || _namedAnimationActive) return;
            var facing = character.Orientation.FacingDirection;
            if (_actions != null && _actions.CurrentAction is UseToolAction)
            {
                if (_actions.State == ActionExecutionState.Preparing)
                {
                    PlayToolPrepareAnimation(facing, character.CurrentTool);
                    return;
                }
                if (_actions.State == ActionExecutionState.Executing)
                {
                    PlayToolUseAnimation(facing, character.CurrentTool);
                    return;
                }
            }
            switch (character.MovementState)
            {
                case MovementState.Walking: PlayNamedClip(walkPrefix, facing); break;
                case MovementState.Running: PlayNamedClip(runPrefix, facing); break;
                case MovementState.Invalid: // Entry binds presentation before publishing the initial idle state.
                case MovementState.Idle: PlayIdleAnimation(facing); break;
                default: throw new ArgumentOutOfRangeException();
            }
        }
        /// <summary>Plays one animation or a base/variation set while suppressing ordinary movement/tool updates.</summary>
        /// <returns>The native state. For a finite clip, yield it to wait for completion or interruption; end the interaction to release the pose.</returns>
        public AnimancerState PlayInteractionAnimation(CharacterAnimationDefinition animation)
        {
            if (!animation) throw new ArgumentNullException(nameof(animation));
            if (animation is CharacterActivityAnimation)
                throw new InvalidOperationException($"Animation '{animation.Id}' is an activity; play it with PlayActivity.");
            var facing = character.Orientation.FacingDirection;
            ValidateInteraction(animation, facing);
            EndNamedAnimation();
            EndInteractionAnimation();
            _interactionFacing = facing;
            _interactionAnimationActive = true;
            _interactionSet = animation is CharacterAnimationSet set && set.Variations.Count > 0 ? set : null;
            PlayInteractionBase(animation.BaseAnimation);
            return _interactionState;
        }

        /// <summary>Resolves every clip an animation or set needs, so a bad reference fails before the current pose is interrupted.</summary>
        private void ValidateInteraction(CharacterAnimationDefinition animation, Vector2 facing)
        {
            var errors = animation.ValidateConfiguration();
            if (errors.Count > 0) throw new InvalidOperationException(string.Join("\n", errors));
            animation.BaseAnimation.ResolveClip(animationLibrary, facing);
            if (animation is CharacterAnimationSet validationSet)
                foreach (var variation in validationSet.Variations)
                {
                    variation.Animation.ValidateAsOneShot(animationLibrary);
                    variation.Animation.ResolveClip(animationLibrary, facing);
                }
        }

        /// <summary>
        /// Plays an activity's start once, then holds its loop until <see cref="ActivityPlayback.RequestEnd"/> plays its end.
        /// Disposing the handle, or any other interaction animation, interrupts it without the end; play it again to restart from its start.
        /// </summary>
        public ActivityPlayback PlayActivity(CharacterActivityAnimation activity)
        {
            if (!activity) throw new ArgumentNullException(nameof(activity));
            if (!isActiveAndEnabled) throw new InvalidOperationException("Activity playback requires an active animator.");
            // Validate every phase before interrupting the current pose.
            var errors = activity.ValidateConfiguration();
            if (errors.Count > 0) throw new InvalidOperationException(string.Join("\n", errors));
            if (activity.Start) ValidateOneShot(activity.Start);
            if (activity.End) ValidateOneShot(activity.End);
            ValidateInteraction(activity.Loop, character.Orientation.FacingDirection);

            var playback = new ActivityPlayback(this, activity);
            if (activity.Start) playback.EnterPhase(ActivityPhase.Starting, activity.Start);
            else playback.EnterPhase(ActivityPhase.Looping, activity.Loop);
            return playback;
        }

        public enum ActivityPhase { Starting, Looping, Ending, Completed }

        public sealed class ActivityPlayback : IDisposable
        {
            private readonly UrCharacterAnimator _owner;
            private readonly CharacterActivityAnimation _activity;
            private AnimancerState _state;

            internal ActivityPlayback(UrCharacterAnimator owner, CharacterActivityAnimation activity)
            { _owner = owner; _activity = activity; }

            public ActivityPhase Phase { get; private set; }
            public bool IsCompleted => Phase == ActivityPhase.Completed;
            /// <summary>Another animation, a location change or disabling the character replaced this activity before it completed.</summary>
            public bool IsInterrupted => !IsCompleted && !ReferenceEquals(_owner._activity, this);

            /// <summary>Plays the end once and then completes; without an end it completes immediately. Ending during the start skips the rest of it.</summary>
            public void RequestEnd()
            {
                if (IsInterrupted) throw new InvalidOperationException("An interrupted activity cannot end; play it again instead.");
                if (Phase is ActivityPhase.Ending or ActivityPhase.Completed) return;
                if (_activity.End) EnterPhase(ActivityPhase.Ending, _activity.End);
                else Complete();
            }

            internal void EnterPhase(ActivityPhase phase, CharacterAnimationDefinition animation)
            {
                // Starting the next phase ends the previous one, which releases the activity; this handle still owns it.
                _state = _owner.PlayInteractionAnimation(animation);
                _owner._activity = this;
                Phase = phase;
            }

            internal void Advance()
            {
                if (Phase == ActivityPhase.Looping)
                {
                    // The loop repeats even when its clip is finite, such as a one-shot Memao gesture.
                    // Set variations return to the base on their own, so only a finished base restarts.
                    var current = _owner._interactionState;
                    if (!_owner._playingVariation && !current.Clip.isLooping && current.NormalizedTime >= 1f)
                        current.Time = 0;
                    return;
                }
                if (_state.NormalizedTime < 1f) return;
                if (Phase == ActivityPhase.Starting) EnterPhase(ActivityPhase.Looping, _activity.Loop);
                else if (Phase == ActivityPhase.Ending) Complete();
            }

            private void Complete()
            {
                Phase = ActivityPhase.Completed;
                _owner._activity = null;
                _owner.EndInteractionAnimation();
            }

            public void Dispose()
            {
                // A completed or replaced activity no longer owns the pose.
                if (IsCompleted || IsInterrupted) return;
                _owner._activity = null;
                _owner.EndInteractionAnimation();
            }
        }

        /// <summary>Checks all facings because earlier scripted actions can turn the actor before playback.</summary>
        public void ValidateOneShot(CharacterAnimation animation)
        {
            if (!animation) throw new ArgumentNullException(nameof(animation));
            animation.ValidateAsOneShot(animationLibrary);
            if (!string.IsNullOrEmpty(animation.MemaoAction))
                animationLibrary.ValidateAction(animation.MemaoAction, oneShot: true);
        }

        /// <summary>Claims finite playback; an optional finished pose survives handle disposal until movement or replacement.</summary>
        public OneShotPlayback PlayOneShot(CharacterAnimation animation, bool holdLastFrame = false)
        {
            ValidateOneShot(animation);
            if (!isActiveAndEnabled) throw new InvalidOperationException("One-shot playback requires an active animator.");
            var state = PlayInteractionAnimation(animation);
            return _oneShot = new OneShotPlayback(this, state, holdLastFrame);
        }

        /// <summary>Owns an emote's pose until its duration ends, including looping clips and finished finite clips.</summary>
        public TimedPlayback PlayTimedAnimation(CharacterAnimation animation, float speed)
        {
            if (!isActiveAndEnabled) throw new InvalidOperationException("Timed playback requires an active animator.");
            var state = PlayInteractionAnimation(animation);
            _timedPlayback = new TimedPlayback(this, state);
            state.Speed = speed;
            return _timedPlayback;
        }

        public sealed class TimedPlayback : IDisposable
        {
            private readonly UrCharacterAnimator _owner;
            private readonly AnimancerState _state;
            private readonly float _previousSpeed;
            internal TimedPlayback(UrCharacterAnimator owner, AnimancerState state)
            { _owner = owner; _state = state; _previousSpeed = state.Speed; }
            internal void RestoreSpeed() => _state.Speed = _previousSpeed;
            public bool IsInterrupted => !ReferenceEquals(_owner._timedPlayback, this);
            public void Dispose()
            {
                if (!IsInterrupted) _owner.EndInteractionAnimation();
            }
        }

        public sealed class OneShotPlayback : IDisposable
        {
            private readonly UrCharacterAnimator _owner;
            private readonly AnimancerState _state;
            private readonly bool _holdLastFrame;
            internal OneShotPlayback(UrCharacterAnimator owner, AnimancerState state, bool holdLastFrame)
            { _owner = owner; _state = state; _holdLastFrame = holdLastFrame; }
            public bool IsInterrupted => !ReferenceEquals(_owner._oneShot, this) ||
                (!_state.IsPlaying && _state.NormalizedTime < 1f);
            public bool IsCompleted => !IsInterrupted && _state.NormalizedTime >= 1f;
            public void Dispose()
            {
                // A stale handle must not stop a replacement, even if it reuses the same clip's native state.
                if (!ReferenceEquals(_owner._oneShot, this)) return;
                if (_holdLastFrame && IsCompleted)
                {
                    // A completed non-looping clip already samples its final pose, even after overshooting its length.
                    // Keep that pose without seeking to a nonzero time (which requires Animancer Pro).
                    _state.IsPlaying = false;
                    _owner._holdingLastFrame = true;
                    _owner.animancer.Evaluate();
                }
                else _owner.EndInteractionAnimation();
            }
        }
        private void PlayInteractionBase(CharacterAnimation animation)
        {
            _interactionState = PlayClip(animation.ResolveClip(animationLibrary, _interactionFacing));
            _interactionState.Time = 0;
            _playingVariation = false;
            if (_interactionSet)
                _variationDelay = Random.Range(_interactionSet.VariationDelay.x, _interactionSet.VariationDelay.y);
        }
        private void ClearInteractionAnimation()
        {
            _holdingLastFrame = false;
            _oneShot = null;
            _timedPlayback = null;
            _activity = null;
            _interactionAnimationActive = false;
            _interactionSet = null;
            _interactionState = null;
            _playingVariation = false;
        }
        /// <summary>Stops the interaction animation and returns ownership to normal locomotion.</summary>
        public void EndInteractionAnimation()
        {
            if (!_interactionAnimationActive) return;
            _timedPlayback?.RestoreSpeed();
            _interactionState.Stop();
            ClearInteractionAnimation();
            if (!isActiveAndEnabled) return; // Disabling a character releases its slot without restarting its animation graph.
            PlayIdleAnimation(character.Orientation.FacingDirection);
            // Apply the idle/default bindings now, before another operation repositions the character.
            animancer.Evaluate();
        }
        private void PlayToolPrepareAnimation(Vector2 facing, ToolData toolData)
        {
            if (!toolData) throw new InvalidOperationException("A preparing tool action requires its equipped tool.");
            bool horizontal = facing != Vector2.zero && Mathf.Abs(facing.x) >= Mathf.Abs(facing.y);
            bool positive = horizontal ? facing.x > 0 : facing.y > 0;
            AnimationClip clipFromTool = horizontal
                ? (positive ? toolData.prepareUseRightAnimationClip : toolData.prepareUseLeftAnimationClip)
                : (positive ? toolData.prepareUseUpAnimationClip : toolData.prepareUseDownAnimationClip);
            PlayClip(clipFromTool ? clipFromTool : animationLibrary.GetDirectional(toolPrepareAction, facing));
        }
        private void PlayToolUseAnimation(Vector2 facing, ToolData toolData)
        {
            if (!toolData) throw new InvalidOperationException("An executing tool action requires its equipped tool.");
            bool horizontal = facing != Vector2.zero && Mathf.Abs(facing.x) >= Mathf.Abs(facing.y);
            bool positive = horizontal ? facing.x > 0 : facing.y > 0;
            AnimationClip clipFromTool = horizontal
                ? (positive ? toolData.useRightAnimationClip : toolData.useLeftAnimationClip)
                : (positive ? toolData.useUpAnimationClip : toolData.useDownAnimationClip);
            PlayClip(clipFromTool ? clipFromTool : animationLibrary.GetDirectional(toolUseAction, facing)).Time = 0f;
        }
        private void PlayIdleAnimation(Vector2 facing)
        {
            PlayNamedClip(idlePrefix, facing);
        }
        /// <summary>Play a finite atlas action (e.g. Chop, Eat, Death) and resume locomotion after completion.</summary>
        public bool PlayNamedAction(string action)
        {
            if (string.IsNullOrWhiteSpace(action)) throw new ArgumentException("A Memao action name is required.", nameof(action));
            if (!isActiveAndEnabled) return false;
            if (_interactionAnimationActive && !_holdingLastFrame) return false;
            // Some optional actions (Paint) intentionally have only left/right clips.
            if (!animationLibrary.TryGet(MemaoAnimationLibrary.DirectionalName(action, character.Orientation.FacingDirection), out var clip)) return false;
            if (clip.isLooping || clip.length <= 0f)
                throw new InvalidOperationException($"Named action '{action}' requires a finite, non-looping clip.");
            if (_holdingLastFrame) EndInteractionAnimation();
            EndNamedAnimation();
            _namedAnimationActive = true;
            _namedState = PlayClip(clip);
            _namedState.Time = 0f;
            return true;
        }
        public void EndNamedAnimation()
        {
            if (!_namedAnimationActive) return;
            _namedAnimationActive = false;
            _namedState.Stop();
            _namedState = null;
            if (isActiveAndEnabled && _isBound) RefreshAnimation();
        }
        private void PlayNamedClip(string prefix, Vector2 facing)
        {
            PlayClip(animationLibrary.GetDirectional(prefix, facing));
        }

        // NamedAnimancerComponent normally keys states by clip.name. Imported libraries and fixed
        // overrides can share names, so every playback path uses the actual clip reference as its key.
        private AnimancerState PlayClip(AnimationClip clip) =>
            animancer.Play(animancer.States.GetOrCreate((object)clip, clip));
        public void OnLocationEnter(LocationData location)
        {
            Bind();
            PlayIdleAnimation(character.Orientation.FacingDirection);
            if (activityOnEnter) _activityOnEnterPlayback = PlayActivity(activityOnEnter);
        }

        [Button("Play Activity On Enter"), PropertyOrder(-1), EnableIf(nameof(activityOnEnter))]
        private void ReplayActivityOnEnter()
        {
            if (!Application.isPlaying) throw new InvalidOperationException("Activities play in Play mode.");
            _activityOnEnterPlayback = PlayActivity(activityOnEnter);
        }

        [Button("End Activity"), PropertyOrder(-1), EnableIf(nameof(activityOnEnter))]
        private void EndActivityOnEnter()
        {
            if (!Application.isPlaying) throw new InvalidOperationException("Activities play in Play mode.");
            if (_activityOnEnterPlayback == null || _activityOnEnterPlayback.IsInterrupted)
                throw new InvalidOperationException("The activity is not playing; play it first.");
            _activityOnEnterPlayback.RequestEnd();
        }
        public void OnLocationLeave(LocationData location)
        {
            EndNamedAnimation();
            EndInteractionAnimation();
            Unbind();
        }
    }
}

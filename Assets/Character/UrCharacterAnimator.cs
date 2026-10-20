using System;
using Animancer;
using Character.Animations;
using Core.Location;
using Interaction;
using Interaction.Tools;
using UnityEngine;

namespace Character
{
    /// <summary>Plays locomotion, tool animations and occupied animation sets, with playback state owned per character.</summary>
    public class UrCharacterAnimator : MonoBehaviour
    {
        [SerializeField] private NamedAnimancerComponent animancer;
        [SerializeField] private GameCharacter character;
        [SerializeField] private MemaoAnimationLibrary animationLibrary;
        public MemaoAnimationLibrary AnimationLibrary => animationLibrary;
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
            if (!_interactionSet) return; // Single animations and sets without variations need no scheduling.
            if (_playingVariation)
            {
                if (_interactionState.NormalizedTime < 1f) return;
                PlayInteractionBase(_interactionSet.BaseAnimation);
                return;
            }
            _variationDelay -= Time.deltaTime;
            if (_variationDelay > 0f) return;
            _interactionState = PlayClip(_interactionSet.SelectVariation(UnityEngine.Random.value)
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
        private void OnMovementStateChanged(MovementState state) => RefreshAnimation();
        private void RefreshAnimation()
        {
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
            var errors = animation.ValidateConfiguration();
            if (errors.Count > 0) throw new InvalidOperationException(string.Join("\n", errors));
            var facing = character.Orientation.FacingDirection;
            // Resolve all required clips before interrupting the current animation.
            animation.BaseAnimation.ResolveClip(animationLibrary, facing);
            if (animation is CharacterAnimationSet validationSet)
                foreach (var variation in validationSet.Variations)
                {
                    variation.Animation.ValidateAsOneShot(animationLibrary);
                    variation.Animation.ResolveClip(animationLibrary, facing);
                }
            EndNamedAnimation();
            EndInteractionAnimation();
            _interactionFacing = facing;
            _interactionAnimationActive = true;
            _interactionSet = animation is CharacterAnimationSet set && set.Variations.Count > 0 ? set : null;
            PlayInteractionBase(animation.BaseAnimation);
            return _interactionState;
        }
        private void PlayInteractionBase(CharacterAnimation animation)
        {
            _interactionState = PlayClip(animation.ResolveClip(animationLibrary, _interactionFacing));
            _interactionState.Time = 0;
            _playingVariation = false;
            if (_interactionSet)
                _variationDelay = UnityEngine.Random.Range(_interactionSet.VariationDelay.x, _interactionSet.VariationDelay.y);
        }
        private void ClearInteractionAnimation()
        {
            _interactionAnimationActive = false;
            _interactionSet = null;
            _interactionState = null;
            _playingVariation = false;
        }
        /// <summary>Stops the interaction animation and returns ownership to normal locomotion.</summary>
        public void EndInteractionAnimation()
        {
            if (!_interactionAnimationActive) return;
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
            if (_interactionAnimationActive) return false;
            // Some optional actions (Paint) intentionally have only left/right clips.
            if (!animationLibrary.TryGet(MemaoAnimationLibrary.DirectionalName(action, character.Orientation.FacingDirection), out var clip)) return false;
            if (clip.isLooping || clip.length <= 0f)
                throw new InvalidOperationException($"Named action '{action}' requires a finite, non-looping clip.");
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
        }
        public void OnLocationLeave(LocationData location)
        {
            EndNamedAnimation();
            EndInteractionAnimation();
            Unbind();
        }
    }
}

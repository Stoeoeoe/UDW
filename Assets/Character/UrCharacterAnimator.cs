using System;
using System.Collections.Generic;
using Animancer;
using Character.Animations;
using Core.Location;
using Interaction;
using Interaction.Tools;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace Character
{
    /// <summary>Plays locomotion, tool animations and occupied animation sets, with playback state owned per character.</summary>
    public class UrCharacterAnimator : MonoBehaviour
    {
        [SerializeField] private NamedAnimancerComponent animancer;
        [SerializeField] private GameCharacter character;

        // [Header("Walk Animations")] [SerializeField]
        // private float walkSpeedMultiplier = 1.0f;

        // [Header("Idle Animations")] [SerializeField]
        // private float idleSpeedMultiplier = 1.0f;

        [SerializeField] private GameObject asepriteFile;

        // Prefixes to look up clips inside the aseprite subresources (e.g. "Walk" -> "Walk_L", "Walk_R", ...)
        [Header("Aseprite Prefixes")] [SerializeField]
        private string walkPrefix = "Walk";

        [SerializeField] private string idlePrefix = "Idle";
        [SerializeField] private string preparePrefix = "PrepareTool";
        [SerializeField] private string usePrefix = "UseTool";

        // Collected clips from aseprite subresources keyed by name
        private readonly Dictionary<string, AnimationClip> _asepriteClips = new();
        private bool _isBound;
        private ActionExecutor _actions;
        private bool _interactionAnimationActive;
        private CharacterAnimationSet _interactionSet;
        private AnimancerState _interactionState;
        private bool _playingVariation;
        private float _variationDelay;


        // [Header("Run Animations")] [SerializeField]
        // private float runSpeedMultiplier = 1.0f;

        private void Awake()
        {
            LoadClipsFromAseprite();
        }


        private void Start()
        {
            if (animancer == null || character == null)
            {
                Debug.LogError("Animancer or Character reference is missing in UrCharacterAnimator.");
            }
        }

        private void OnDisable()
        {
            EndInteractionAnimation();
            Unbind();
        }

        private void Update()
        {
            if (!_interactionSet) return; // Single animations and sets without variations need no scheduling.
            if (_playingVariation)
            {
                if (_interactionState.NormalizedTime < 1f) return;
                PlayInteractionBase(_interactionSet.BaseAnimation);
                return;
            }
            _variationDelay -= Time.deltaTime;
            if (_variationDelay > 0f) return;
            _interactionState = animancer.Play(_interactionSet.SelectVariation(UnityEngine.Random.value).Clip);
            _interactionState.Time = 0;
            _playingVariation = true;
        }

        private void Bind()
        {
            if (_isBound) return;
            if (!animancer || !character)
                throw new InvalidOperationException("Character animation requires Animancer and its owning character.");
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
            if (_interactionAnimationActive) return;
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
                case MovementState.Walking:
                case MovementState.Running: PlayWalkAnimation(facing); break;
                case MovementState.Invalid: // Entry binds presentation before publishing the initial idle state.
                case MovementState.Idle: PlayIdleAnimation(facing); break;
                default: throw new ArgumentOutOfRangeException();
            }
        }

        private void LoadClipsFromAseprite()
        {
            _asepriteClips.Clear();
            if (asepriteFile == null) return;

            // Only load AnimationClip sub-assets from the referenced asset (Aseprite-exported clips).
            // This requires the asepriteFile to be an asset (prefab) in the project, not just a scene instance.
#if UNITY_EDITOR
            var path = AssetDatabase.GetAssetPath(asepriteFile);
            if (string.IsNullOrEmpty(path))
            {
                Debug.LogWarning(
                    "asepriteFile does not point to a project asset. Assign the prefab/asset that contains Aseprite sub-assets.");
                return;
            }

            var assets = AssetDatabase.LoadAllAssetsAtPath(path);
            foreach (var asset in assets)
            {
                if (asset is AnimationClip clip && clip != null)
                    _asepriteClips.TryAdd(clip.name, clip);
            }
#else
            Debug.LogWarning("Loading Aseprite subresources requires the Unity editor (AssetDatabase). At runtime, provide clips via another workflow.");
#endif
        }

        // Build names like "{prefix}_L" / "_R" / "_U" / "_D" from a cardinal facing Vector2.
        private AnimationClip GetAsepriteClip(string prefix, Vector2 facing)
        {
            if (string.IsNullOrEmpty(prefix)) return null;
            string suffix;
            if (facing == Vector2.zero)
                suffix = "";
            else if (Mathf.Abs(facing.x) >= Mathf.Abs(facing.y))
                suffix = facing.x >= 0 ? "_R" : "_L";
            else
                suffix = facing.y >= 0 ? "_U" : "_D";
            var fullName = prefix + suffix;
            _asepriteClips.TryGetValue(fullName, out var clip);
            return clip;
        }

        /// <summary>Plays one animation or a base/variation set while suppressing ordinary movement/tool updates.</summary>
        /// <returns>The native state. For a finite clip, yield it to wait for completion or interruption; end the interaction to release the pose.</returns>
        public AnimancerState PlayInteractionAnimation(CharacterAnimationDefinition animation)
        {
            EndInteractionAnimation();
            _interactionAnimationActive = true;
            _interactionSet = animation is CharacterAnimationSet set && set.Variations.Count > 0 ? set : null;
            PlayInteractionBase(animation.BaseAnimation);
            return _interactionState;
        }

        private void PlayInteractionBase(CharacterAnimation animation)
        {
            _interactionState = animancer.Play(animation.Clip);
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

        private void PlayInvalidAnimation()
        {
            var aseClip = GetAsepriteClip("Invalid", Vector2.zero);
            if (aseClip) animancer.Play(aseClip);
            else Debug.LogWarning("No 'Invalid' animation found in Aseprite sub-assets.");
        }

        private void PlayToolPrepareAnimation(Vector2 facing, ToolData toolData)
        {
            bool horizontal = Mathf.Abs(facing.x) >= Mathf.Abs(facing.y);
            bool positive = horizontal ? facing.x >= 0 : facing.y >= 0;
            AnimationClip clipFromTool = horizontal
                ? (positive ? toolData.prepareUseRightAnimationClip : toolData.prepareUseLeftAnimationClip)
                : (positive ? toolData.prepareUseUpAnimationClip : toolData.prepareUseDownAnimationClip);
            var aseClip = GetAsepriteClip(preparePrefix, facing);
            var toPlay = clipFromTool ? clipFromTool : aseClip;
            if (toPlay) animancer.Play(toPlay);
            else Debug.LogWarning($"No prepare animation for prefix '{preparePrefix}' facing {facing}");
        }

        private void PlayToolUseAnimation(Vector2 facing, ToolData toolData)
        {
            bool horizontal = Mathf.Abs(facing.x) >= Mathf.Abs(facing.y);
            bool positive = horizontal ? facing.x >= 0 : facing.y >= 0;
            AnimationClip clipFromTool = horizontal
                ? (positive ? toolData.useRightAnimationClip : toolData.useLeftAnimationClip)
                : (positive ? toolData.useUpAnimationClip : toolData.useDownAnimationClip);
            var aseClip = GetAsepriteClip(usePrefix, facing);
            var toPlay = clipFromTool ? clipFromTool : aseClip;
            if (toPlay) animancer.Play(toPlay);
            else Debug.LogWarning($"No use animation for prefix '{usePrefix}' facing {facing}");
        }

        private void PlayWalkAnimation(Vector2 facing)
        {
            var aseClip = GetAsepriteClip(walkPrefix, facing);
            if (aseClip) animancer.Play(aseClip);
            else Debug.LogWarning($"No walk animation for prefix '{walkPrefix}' facing {facing}");
        }

        private void PlayIdleAnimation(Vector2 facing)
        {
            var aseClip = GetAsepriteClip(idlePrefix, facing);
            if (aseClip) animancer.Play(aseClip);
            else Debug.LogWarning($"No idle animation for prefix '{idlePrefix}' facing {facing}");
        }

        public void OnLocationEnter(LocationData location)
        {
            Bind();
            PlayIdleAnimation(character.Orientation.FacingDirection);
        }

        public void OnLocationLeave(LocationData location)
        {
            EndInteractionAnimation();
            Unbind();
        }
    }
}

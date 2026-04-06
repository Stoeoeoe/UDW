using System;
using System.Collections.Generic;
using Animancer;
using Core.Context;
using Core.Location;
using Interaction;
using Interaction.Tools;
using UnityEngine;
using InteractionMode = Core.Context.InteractionMode;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace Character
{
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
            Unbind();
        }

        private void TryBind()
        {
            if (_isBound || PlayerInteractionContext.Instance == null || character == null)
                return;

            PlayerInteractionContext.Instance.OnContextChanged += UpdateAnimator;
            character.OnMovementStateChanged += OnMovementStateChanged;
            character.Orientation.OnFacingDirectionChanged += OnFacingDirectionChanged;
            _isBound = true;
        }

        private void Unbind()
        {
            if (!_isBound)
                return;

            if (PlayerInteractionContext.Instance != null)
                PlayerInteractionContext.Instance.OnContextChanged -= UpdateAnimator;

            if (character != null)
            {
                character.OnMovementStateChanged -= OnMovementStateChanged;
                character.Orientation.OnFacingDirectionChanged -= OnFacingDirectionChanged;
            }

            _isBound = false;
        }

        private void OnFacingDirectionChanged(Vector2 newDirection)
        {
            var snapshot = PlayerInteractionContext.Instance.CurrentSnapshot;
            if (snapshot == null) return;

            var mainCharacter = MainCharacter.CurrentMainCharacter;
            if (!mainCharacter) return;

            var actionState = mainCharacter.PerformPrimaryAction.ActionExecutor.State;
            if (snapshot.Mode == InteractionMode.Tool)
            {
                switch (actionState)
                {
                    case ActionExecutionState.Preparing:
                        PlayToolPrepareAnimation(newDirection, character.CurrentTool);
                        return;
                    case ActionExecutionState.Executing:
                        PlayToolUseAnimation(newDirection, character.CurrentTool);
                        return;
                }
            }

            switch (character.MovementState)
            {
                case MovementState.Walking:
                case MovementState.Running: PlayWalkAnimation(newDirection); break;
                case MovementState.Idle: PlayIdleAnimation(newDirection); break;
                default:
                    throw new ArgumentOutOfRangeException();
            }
        }

        private void OnMovementStateChanged(MovementState newState)
        {
            var snapshot = PlayerInteractionContext.Instance.CurrentSnapshot;
            if (snapshot == null) return;
            // Snapshot.MovementState may be stale (LateUpdate hasn't run yet), so use the live value.
            var facingDirection = character.Orientation.FacingDirection;
            switch (newState)
            {
                case MovementState.Walking:
                case MovementState.Running:
                    PlayWalkAnimation(facingDirection);
                    break;
                case MovementState.Idle:
                    PlayIdleAnimation(facingDirection);
                    break;
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

        private void UpdateAnimator(PlayerInteractionContextSnapshot playerInteractionContextSnapshot)
        {
            var facingDirection = character.Orientation.FacingDirection;
            var snapshot = PlayerInteractionContext.Instance.CurrentSnapshot;
            var mainCharacter = MainCharacter.CurrentMainCharacter;
            if (mainCharacter == null)
            {
                PlayIdleAnimation(facingDirection);
                return;
            }

            var actionState = mainCharacter.PerformPrimaryAction.ActionExecutor.State;

            if (snapshot.Mode == InteractionMode.Tool)
            {
                if (actionState == ActionExecutionState.Preparing)
                {
                    PlayToolPrepareAnimation(facingDirection, character.CurrentTool);
                    return;
                }

                if (actionState == ActionExecutionState.Executing)
                {
                    PlayToolUseAnimation(facingDirection, character.CurrentTool);
                    return;
                }
            }

            switch (snapshot.MovementState)
            {
                case MovementState.Idle:
                    PlayIdleAnimation(facingDirection);
                    break;
                case MovementState.Walking:
                case MovementState.Running:
                    PlayWalkAnimation(facingDirection);
                    break;
            }
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
            TryBind();
            PlayIdleAnimation(character.Orientation.FacingDirection);
        }

        public void OnLocationLeave(LocationData location)
        {
            Unbind();
        }
    }
}
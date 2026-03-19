using System.Collections.Generic;
using Animancer;
using Core.Context;
using Interaction;
using Interaction.Tools;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;
using FacingDirections = MoreMountains.TopDownEngine.Character.FacingDirections;
using InteractionMode = Core.Context.InteractionMode;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace Character
{
    public class UrCharacterAnimator : MonoBehaviour
    {
        [SerializeField] private NamedAnimancerComponent animancer;
        [SerializeField] private UrCharacter character;

        // [Header("Walk Animations")] [SerializeField]
        // private float walkSpeedMultiplier = 1.0f;

        // [Header("Idle Animations")] [SerializeField]
        // private float idleSpeedMultiplier = 1.0f;

        [SerializeField] private GameObject asepriteFile;

        // Prefixes to look up clips inside the aseprite subresources (e.g. "Walk" -> "Walk_L", "Walk_R", ...)
        [Header("Aseprite Prefixes")]
        [SerializeField] private string walkPrefix = "Walk";
        [SerializeField] private string idlePrefix = "Idle";
        [SerializeField] private string preparePrefix = "PrepareTool";
        [SerializeField] private string usePrefix = "UseTool";

        // Collected clips from aseprite subresources keyed by name
        private Dictionary<string, AnimationClip> asepriteClips = new Dictionary<string, AnimationClip>();


        // [Header("Run Animations")] [SerializeField]
        // private float runSpeedMultiplier = 1.0f;


        private void Start()
        {
            if (animancer == null || character == null)
            {
                Debug.LogError("Animancer or Character reference is missing in UrCharacterAnimator.");
            }
            PlayerInteractionContext.Current.OnContextChanged += UpdateAnimator;

            // Collect animation clips from the referenced aseprite prefab/asset
            LoadClipsFromAseprite();
        }

        private void LoadClipsFromAseprite()
        {
            asepriteClips.Clear();
            if (asepriteFile == null) return;

            // Only load AnimationClip sub-assets from the referenced asset (Aseprite-exported clips).
            // This requires the asepriteFile to be an asset (prefab) in the project, not just a scene instance.
#if UNITY_EDITOR
            var path = AssetDatabase.GetAssetPath(asepriteFile);
            if (string.IsNullOrEmpty(path))
            {
                Debug.LogWarning("asepriteFile does not point to a project asset. Assign the prefab/asset that contains Aseprite sub-assets.");
                return;
            }
            var assets = AssetDatabase.LoadAllAssetsAtPath(path);
            foreach (var asset in assets)
            {
                if (asset is AnimationClip clip && clip != null && !asepriteClips.ContainsKey(clip.name))
                    asepriteClips[clip.name] = clip;
            }
#else
            Debug.LogWarning("Loading Aseprite subresources requires the Unity editor (AssetDatabase). At runtime, provide clips via another workflow.");
#endif
        }

        // Build names like "{prefix}_L" / "_R" / "_U" / "_D" and return the matching aseprite clip if present.
        private AnimationClip GetAsepriteClip(string prefix, FacingDirections direction)
        {
            if (string.IsNullOrEmpty(prefix)) return null;
            string suffix = direction switch
            {
                FacingDirections.North => "_U",
                FacingDirections.East => "_R",
                FacingDirections.South => "_D",
                FacingDirections.West => "_L",
                _ => "_D"
            };
            var name = prefix + suffix;
            asepriteClips.TryGetValue(name, out var clip);
            return clip;
        }

        private void UpdateAnimator(PlayerInteractionContextSnapshot playerInteractionContextSnapshot)
        {
            // TODO: Correct?
            
            // TODO: Use playerInteractionContextSnapshot
            
            var facingDirection = character.Orientation2D.CurrentFacingDirection;
            var snapshot = PlayerInteractionContext.Current.CurrentSnapshot;
            var actionState = MainCharacter.CurrentMainCharacter.PerformPrimaryAction.ActionExecutor.State;
            
            if (snapshot.Mode == InteractionMode.Tool)
            {
                if(actionState == ActionExecutionState.Preparing)
                {
                    PlayToolPrepareAnimation(facingDirection, character.CurrentTool);
                    return;
                }
                if(actionState == ActionExecutionState.Executing)
                {
                    PlayToolUseAnimation(facingDirection, character.CurrentTool);
                    return;
                }
            }
            
            switch (snapshot.MovementState)
            {
                case CharacterStates.MovementStates.Idle:
                    PlayIdleAnimation(facingDirection);
                    break;
                case CharacterStates.MovementStates.Walking:
                    PlayWalkAnimation(facingDirection);
                    break;
                case CharacterStates.MovementStates.Running:
                    PlayWalkAnimation(facingDirection); // Assuming running uses the same animation as walking for now
                    break;
                default:
                    break;
            }
        }

        private void PlayToolPrepareAnimation(FacingDirections direction, ToolData toolData)
        {
            // Tool-specific clip takes precedence, then aseprite subresource (prefix).
            var clipFromTool = direction switch
            {
                FacingDirections.North => toolData.prepareUseUpAnimationClip,
                FacingDirections.East => toolData.prepareUseRightAnimationClip,
                FacingDirections.South => toolData.prepareUseDownAnimationClip,
                FacingDirections.West => toolData.prepareUseLeftAnimationClip,
                _ => null
            };
            var aseClip = GetAsepriteClip(preparePrefix, direction);
            var toPlay = clipFromTool ? clipFromTool : aseClip;
            if (toPlay != null) animancer.Play(toPlay);
            else Debug.LogWarning($"No prepare animation found for prefix '{preparePrefix}' and direction {direction}");
        }

        private void PlayToolUseAnimation(FacingDirections direction, ToolData toolData)
        {
            var clipFromTool = direction switch
            {
                FacingDirections.North => toolData.useUpAnimationClip,
                FacingDirections.East => toolData.useRightAnimationClip,
                FacingDirections.South => toolData.useDownAnimationClip,
                FacingDirections.West => toolData.useLeftAnimationClip,
                _ => null
            };
            var aseClip = GetAsepriteClip(usePrefix, direction);
            var toPlay = clipFromTool ? clipFromTool : aseClip;
            if (toPlay != null) animancer.Play(toPlay);
            else Debug.LogWarning($"No use animation found for prefix '{usePrefix}' and direction {direction}");
        }

        private void PlayWalkAnimation(FacingDirections direction)
        {
            var aseClip = GetAsepriteClip(walkPrefix, direction);
            if (aseClip != null) animancer.Play(aseClip);
            else Debug.LogWarning($"No walk animation found for prefix '{walkPrefix}' and direction {direction}");
        }

        private void PlayIdleAnimation(FacingDirections direction)
        {
            var aseClip = GetAsepriteClip(idlePrefix, direction);
            if (aseClip != null) animancer.Play(aseClip);
            else Debug.LogWarning($"No idle animation found for prefix '{idlePrefix}' and direction {direction}");
        }
    }
}
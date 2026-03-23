using System;
using Items;
using Sirenix.OdinInspector;
using Tools;
using UnityEngine;

namespace Interaction.Tools
{
    [CreateAssetMenu(fileName = "Tool Data", menuName = "Game/ToolData", order = 0)]
    [InlineEditor]
    public class ToolData : EquippableItem
    {
        public string toolName;
        public int maxCharge = 0;
        public int chargePerUsage = 0;
        public int staminaCost = 5;
        public bool consumeStaminaOnFailure = true; 
        public bool isInInventory = true;
        public bool showTileHighlighterOnPrepare = true;
        // public Sprite icon;
        
        // [Obsolete("Use ToolActionRegistry with AbstractToolAction prefabs instead.")]
        // public ToolBehaviour prefab;
        public float actionDuration = 0.2f;
        public float cooldownDuration = 0.2f;
        
        public ToolEffectConfiguration toolEffectConfiguration;

        public AnimationClip prepareUseUpAnimationClip;
        public AnimationClip prepareUseRightAnimationClip;
        public AnimationClip prepareUseDownAnimationClip;
        public AnimationClip prepareUseLeftAnimationClip;
        
        public AnimationClip useUpAnimationClip;
        public AnimationClip useRightAnimationClip;
        public AnimationClip useDownAnimationClip;
        public AnimationClip useLeftAnimationClip;
    }
}
using Core.Common;
using Items;
using Sirenix.OdinInspector;
using Tools;
using UnityEngine;

namespace Interaction.Tools
{
    [CreateAssetMenu(fileName = "Tool", menuName = "Game/Items/Tools/Tool", order = 0)]
    [InlineEditor]
    public class ToolData : EquippableItem
    {
        private static readonly ToolDataValidator Validator = new();
        protected override IScriptableObjectValidator ConfigurationValidator => Validator;

        [SerializeField, Validation.Min(0, "Must be nonnegative; zero disables charge storage.")]
        private int maxCharge = 0;

        [SerializeField, Validation.Min(0)]
        private int chargePerUsage = 0;

        [SerializeField, Tooltip("Slot bar colour for tools with charge storage.")]
        private Color chargeColor = new(0.18f, 0.55f, 0.9f);

        [SerializeField, Validation.Min(0)]
        private int staminaCost = 5;

        [SerializeField]
        private bool consumeStaminaOnFailure = true;

        [SerializeField]
        private bool isInInventory = true;

        [SerializeField]
        private bool showTileHighlighterOnPrepare = true;

        [SerializeField, Validation.Finite, Validation.Min(0)]
        private float actionDuration = 0.2f;

        [SerializeField, Validation.Finite, Validation.Min(0)]
        private float cooldownDuration = 0.2f;

        [SerializeField, Validation.Required("Assign an effect configuration."), Validation.Nested]
        private ToolEffectConfiguration toolEffectConfiguration;

        [Tooltip("Facing tools affect the tiles in the effect configuration. Pointer tools affect the tile under the pointer; their effect configuration stays empty.")]
        [SerializeField, Validation.DefinedEnum]
        private ToolTargeting targeting;

        [Tooltip("Pointer tools only: the farthest tile from the character that can be targeted.")]
        [SerializeField, Validation.Min(1)]
        private int pointerRange = 3;

        [SerializeField]
        private AnimationClip prepareUseUpAnimationClip;

        [SerializeField]
        private AnimationClip prepareUseRightAnimationClip;

        [SerializeField]
        private AnimationClip prepareUseDownAnimationClip;

        [SerializeField]
        private AnimationClip prepareUseLeftAnimationClip;

        [SerializeField]
        private AnimationClip useUpAnimationClip;

        [SerializeField]
        private AnimationClip useRightAnimationClip;

        [SerializeField]
        private AnimationClip useDownAnimationClip;

        [SerializeField]
        private AnimationClip useLeftAnimationClip;

        public int MaxCharge => maxCharge;
        public int ChargePerUsage => chargePerUsage;
        public Color ChargeColor => chargeColor;
        public int StaminaCost => staminaCost;
        public bool ConsumeStaminaOnFailure => consumeStaminaOnFailure;
        public bool IsInInventory => isInInventory;
        public bool ShowTileHighlighterOnPrepare => showTileHighlighterOnPrepare;
        public float ActionDuration => actionDuration;
        public float CooldownDuration => cooldownDuration;
        public ToolEffectConfiguration ToolEffectConfiguration => toolEffectConfiguration;
        public ToolTargeting Targeting => targeting;
        public int PointerRange => pointerRange;
        public AnimationClip PrepareUseUpAnimationClip => prepareUseUpAnimationClip;
        public AnimationClip PrepareUseRightAnimationClip => prepareUseRightAnimationClip;
        public AnimationClip PrepareUseDownAnimationClip => prepareUseDownAnimationClip;
        public AnimationClip PrepareUseLeftAnimationClip => prepareUseLeftAnimationClip;
        public AnimationClip UseUpAnimationClip => useUpAnimationClip;
        public AnimationClip UseRightAnimationClip => useRightAnimationClip;
        public AnimationClip UseDownAnimationClip => useDownAnimationClip;
        public AnimationClip UseLeftAnimationClip => useLeftAnimationClip;

    }
}

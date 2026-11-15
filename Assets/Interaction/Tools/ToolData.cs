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

        [field: SerializeField, Validation.Min(0, "Must be nonnegative; zero disables charge storage.")]
        public int MaxCharge { get; private set; } = 0;

        [field: SerializeField, Validation.Min(0)]
        public int ChargePerUsage { get; private set; } = 0;

        [field: SerializeField, Tooltip("Slot bar colour for tools with charge storage.")]
        public Color ChargeColor { get; private set; } = new(0.18f, 0.55f, 0.9f);

        [field: SerializeField, Validation.Min(0)]
        public int StaminaCost { get; private set; } = 5;

        [field: SerializeField]
        public bool ConsumeStaminaOnFailure { get; private set; } = true;

        [field: SerializeField]
        public bool IsInInventory { get; private set; } = true;

        [field: SerializeField]
        public bool ShowTileHighlighterOnPrepare { get; private set; } = true;

        [field: SerializeField, Validation.Finite, Validation.Min(0)]
        public float ActionDuration { get; private set; } = 0.2f;

        [field: SerializeField, Validation.Finite, Validation.Min(0)]
        public float CooldownDuration { get; private set; } = 0.2f;

        [field: SerializeField, Validation.Required("Assign an effect configuration."), Validation.Nested]
        public ToolEffectConfiguration ToolEffectConfiguration { get; private set; }

        [field: Tooltip("Facing tools affect the tiles in the effect configuration. Pointer tools affect the tile under the pointer; their effect configuration stays empty."), SerializeField, Validation.DefinedEnum]
        public ToolTargeting Targeting { get; private set; }

        [field: Tooltip("Pointer tools only: the farthest tile from the character that can be targeted."), SerializeField, Validation.Min(1)]
        public int PointerRange { get; private set; } = 3;

        [field: SerializeField]
        public AnimationClip PrepareUseUpAnimationClip { get; private set; }

        [field: SerializeField]
        public AnimationClip PrepareUseRightAnimationClip { get; private set; }

        [field: SerializeField]
        public AnimationClip PrepareUseDownAnimationClip { get; private set; }

        [field: SerializeField]
        public AnimationClip PrepareUseLeftAnimationClip { get; private set; }

        [field: SerializeField]
        public AnimationClip UseUpAnimationClip { get; private set; }

        [field: SerializeField]
        public AnimationClip UseRightAnimationClip { get; private set; }

        [field: SerializeField]
        public AnimationClip UseDownAnimationClip { get; private set; }

        [field: SerializeField]
        public AnimationClip UseLeftAnimationClip { get; private set; }

    }
}

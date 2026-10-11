using Core.Common;
using System;
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
        private int _maxCharge = 0;

        [SerializeField, Validation.Min(0)]
        private int _chargePerUsage = 0;

        [SerializeField, Validation.Min(0)]
        private int _staminaCost = 5;

        [SerializeField]
        private bool _consumeStaminaOnFailure = true;

        [SerializeField]
        private bool _isInInventory = true;

        [SerializeField]
        private bool _showTileHighlighterOnPrepare = true;

        [SerializeField, Validation.Finite, Validation.Min(0)]
        private float _actionDuration = 0.2f;

        [SerializeField, Validation.Finite, Validation.Min(0)]
        private float _cooldownDuration = 0.2f;

        [SerializeField, Validation.Required("Assign an effect configuration."), Validation.Nested]
        private ToolEffectConfiguration _toolEffectConfiguration;

        [SerializeField]
        private AnimationClip _prepareUseUpAnimationClip;

        [SerializeField]
        private AnimationClip _prepareUseRightAnimationClip;

        [SerializeField]
        private AnimationClip _prepareUseDownAnimationClip;

        [SerializeField]
        private AnimationClip _prepareUseLeftAnimationClip;

        [SerializeField]
        private AnimationClip _useUpAnimationClip;

        [SerializeField]
        private AnimationClip _useRightAnimationClip;

        [SerializeField]
        private AnimationClip _useDownAnimationClip;

        [SerializeField]
        private AnimationClip _useLeftAnimationClip;

        public int maxCharge => _maxCharge;
        public int chargePerUsage => _chargePerUsage;
        public int staminaCost => _staminaCost;
        public bool consumeStaminaOnFailure => _consumeStaminaOnFailure;
        public bool isInInventory => _isInInventory;
        public bool showTileHighlighterOnPrepare => _showTileHighlighterOnPrepare;
        public float actionDuration => _actionDuration;
        public float cooldownDuration => _cooldownDuration;
        public ToolEffectConfiguration toolEffectConfiguration => _toolEffectConfiguration;
        public AnimationClip prepareUseUpAnimationClip => _prepareUseUpAnimationClip;
        public AnimationClip prepareUseRightAnimationClip => _prepareUseRightAnimationClip;
        public AnimationClip prepareUseDownAnimationClip => _prepareUseDownAnimationClip;
        public AnimationClip prepareUseLeftAnimationClip => _prepareUseLeftAnimationClip;
        public AnimationClip useUpAnimationClip => _useUpAnimationClip;
        public AnimationClip useRightAnimationClip => _useRightAnimationClip;
        public AnimationClip useDownAnimationClip => _useDownAnimationClip;
        public AnimationClip useLeftAnimationClip => _useLeftAnimationClip;

    }
}

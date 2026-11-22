using System.Collections;
using Character;
using Core.Inventory;
using Core.Items;
using Interaction;
using UnityEngine;
using VContainer;

namespace Plants
{
    /// <summary>Lets a character pick a saved crop or clear it when wilted, with interaction feedback.</summary>
    public sealed class PlantHarvestInteractable : AbstractInteractable
    {
        [Inject] private PlantManager _plantManager;
        [Inject] private ItemManager _itemManager;

        // The character stands still, and the crop ignores further presses, until the pick animation ends.
        private bool _picking;

        private string _locationId;
        private Vector2Int _position;
        private PlantData _definition;
        private PlantState _state;

        // FarmablePlant binds the crop identity before enabling the root.
        internal void Bind(string locationId, Vector2Int position, PlantData definition, PlantState state)
        {
            _locationId = locationId;
            _position = position;
            _definition = definition;
            _state = state;
            UnlimitedActivations = true;
            cooldownMode = InteractionCooldownMode.None;
            // The growth-stage visuals are children of the crop root.
            SetTarget(transform);
        }

        public override bool RequiresButtonPress => true;
        public override InteractionVerb Verb => CanClearWilted ? InteractionVerb.Clear : InteractionVerb.Harvest;
        // A replaced crop at the same tile is a different target, even before this view is destroyed.
        private bool IsCurrentCrop => _plantManager.GetPlantState(_locationId, _position) == _state;
        private bool CanClearWilted => IsCurrentCrop && _state.condition == PlantCondition.Wilted;
        public override bool CanInteract => !_picking && (CanClearWilted ||
            (IsCurrentCrop && _plantManager.CanHarvest(_locationId, _position, HarvestMethod.Picking)));

        /// <summary>Picks this crop into inventory; an unavailable crop or full bag leaves both unchanged.</summary>
        public bool TryHarvest(SlotInventory inventory) => IsCurrentCrop &&
            _plantManager.TryHarvest(_locationId, _position, HarvestMethod.Picking, inventory);

        /// <summary>Removes this wilted crop and plays its optional clearing feedback independently of the view.</summary>
        public bool TryClearWilted()
        {
            if (!CanClearWilted) return false;
            // The removal event can destroy this root synchronously, so capture presentation first.
            var feedbackPrefab = _definition.WiltedFeedbackPrefab;
            var position = transform.position;
            if (!_plantManager.TryClearWilted(_locationId, _position)) return false;
            if (feedbackPrefab)
            {
                // The standalone prefab autoplays and owns cleanup after the crop root is gone.
                Instantiate(feedbackPrefab, position, Quaternion.identity);
            }
            return true;
        }

        // Crop state owns availability and regrowth. The generic use/cooldown bookkeeping
        // in the base entry point does not apply; feedback depends on inventory success.
        public override void TriggerInteraction(GameCharacter instigator) => Interact(instigator);

        protected override bool Interact(GameCharacter instigator)
        {
            if (CanClearWilted)
            {
                return TryClearWilted();
            }
            if (!CanInteract)
            {
                DeniedFeedback?.PlayFeedbacks();
                return false;
            }
            var animation = _itemManager.PickAnimation;
            if (!animation) return Pick(instigator);
            // Like foraging: the character reaches down, then the crop is picked with the pickup sound.
            var action = animation.MemaoAction;
            instigator.Animator.PlayNamedAction(action);
            var seconds = instigator.Animator.AnimationLibrary.GetDirectional(action, instigator.Orientation.FacingDirection).length;
            _picking = true;
            instigator.SetControlBlocked(this, true);
            StartCoroutine(PickAfter(instigator, seconds));
            return true;
        }

        private IEnumerator PickAfter(GameCharacter picker, float seconds)
        {
            yield return new WaitForSeconds(seconds);
            _picking = false;
            picker.SetControlBlocked(this, false);
            Pick(picker);
        }

        private bool Pick(GameCharacter picker)
        {
            if (!TryHarvest(picker.MainInventory))
            {
                DeniedFeedback?.PlayFeedbacks();
                return false;
            }
            _itemManager.PlayPickupSound(_definition.HarvestItem.PickupSound);
            ActivationFeedback?.PlayFeedbacks();
            return true;
        }
    }
}

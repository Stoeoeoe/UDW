using Character;
using Core.Inventory;
using Interaction;
using UnityEngine;

namespace Plants
{
    /// <summary>Lets a character pick a saved crop or clear it when wilted, with interaction feedback.</summary>
    public sealed class PlantHarvestInteractable : AbstractInteractable
    {
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
        }

        public override bool RequiresButtonPress => true;
        // A replaced crop at the same tile is a different target, even before this view is destroyed.
        private bool IsCurrentCrop => PlantManager.Instance.GetPlantState(_locationId, _position) == _state;
        private bool CanClearWilted => IsCurrentCrop && _state.condition == PlantCondition.Wilted;
        public override bool CanInteract => CanClearWilted ||
            (IsCurrentCrop && PlantManager.Instance.CanHarvest(_locationId, _position, HarvestMethod.Picking));

        /// <summary>Picks this crop into inventory; an unavailable crop or full bag leaves both unchanged.</summary>
        public bool TryHarvest(SlotInventory inventory) => IsCurrentCrop &&
            PlantManager.Instance.TryHarvest(_locationId, _position, HarvestMethod.Picking, inventory);

        /// <summary>Removes this wilted crop and plays its optional clearing feedback independently of the view.</summary>
        public bool TryClearWilted()
        {
            if (!CanClearWilted) return false;
            // The removal event can destroy this root synchronously, so capture presentation first.
            var feedbackPrefab = _definition.WiltedFeedbackPrefab;
            var position = transform.position;
            if (!PlantManager.Instance.TryClearWilted(_locationId, _position)) return false;
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

        protected override void Interact(GameCharacter instigator)
        {
            if (CanClearWilted)
            {
                TryClearWilted();
                return;
            }
            if (!CanInteract || !TryHarvest(instigator.MainInventory))
            {
                DeniedFeedback?.PlayFeedbacks();
                return;
            }
            ActivationFeedback?.PlayFeedbacks();
        }
    }
}

using System.Collections;
using Core.Context;
using Core.Items;

namespace Interaction
{
    /// <summary>
    /// Generic action for InteractionMode.Interact.
    /// Calls TriggerInteraction on the nearest valid interactable.
    /// Pointer takes precedence over proximity (consistent with StartDialogueAction).
    /// </summary>
    public class InteractAction : PrimaryAction
    {
        private PickupableInteractable _pickup;
        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot) =>
            snapshot.SceneReady && snapshot.ActionableInteractable != null;

        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            var interactable = snapshot.ActionableInteractable;
            _pickup = interactable as PickupableInteractable;
            interactable?.TriggerInteraction(Owner);
            while (_pickup && _pickup.IsPickingUp) yield return null;
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            if (_pickup) _pickup.CancelPickup();
        }

        public override void OnEnd(PlayerInteractionContextSnapshot snapshot)
        {
            if (_pickup) _pickup.CancelPickup();
            _pickup = null;
        }
    }
}

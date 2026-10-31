using UnityEngine;
using System.Threading;
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

        public override async Awaitable OnExecute(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            var interactable = snapshot.ActionableInteractable;
            _pickup = interactable as PickupableInteractable;
            interactable?.TriggerInteraction(Owner);
            while (_pickup && _pickup.IsPickingUp) await Awaitable.NextFrameAsync(cancellation);
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

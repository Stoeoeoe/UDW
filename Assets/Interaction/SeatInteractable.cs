using System;
using Character;
using UnityEngine;

namespace Interaction
{
    /// <summary>Lets the normal interaction action enter one seat; the seated character requests its own exit.</summary>
    public sealed class SeatInteractable : AbstractInteractable
    {
        [SerializeField] private InteractionSlot slot;

        public override bool CanInteract => base.CanInteract && slot.IsAvailable;

        protected override void Awake()
        {
            base.Awake();
            if (!slot) throw new InvalidOperationException("A seat requires its interaction slot.");
        }

        protected override void OnEnable()
        {
            base.OnEnable();
            slot.StateChanged += OnSlotChanged;
        }

        protected override void OnDisable()
        {
            slot.StateChanged -= OnSlotChanged;
            slot.Occupant?.ReleaseImmediately();
            base.OnDisable();
        }

        private void OnSlotChanged() => InteractableStateChangedEvent.Trigger(this, RemainingUses);

        protected override bool Interact(GameCharacter instigator) => instigator.Occupation.TryEnter(slot);
    }
}

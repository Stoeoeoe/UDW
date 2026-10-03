using Core.Events;

namespace Interaction
{
    /// <summary>Raised after a use or cooldown transition. RemainingUses is -1 for unlimited use.</summary>
    public struct InteractableStateChangedEvent
    {
        public AbstractInteractable Interactable;
        public int RemainingUses;

        public static void Trigger(AbstractInteractable interactable, int remainingUses) =>
            EventBus<InteractableStateChangedEvent>.Raise(new InteractableStateChangedEvent
            {
                Interactable = interactable,
                RemainingUses = remainingUses
            });
    }
}

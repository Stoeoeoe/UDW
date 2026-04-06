using Core.Events;

namespace Interaction.Pointer
{
    public struct PointerInteractableChangedEvent
    {
        public AbstractInteractable Interactable;

        public static void Trigger(AbstractInteractable interactable)
            => EventBus<PointerInteractableChangedEvent>.Raise(new PointerInteractableChangedEvent { Interactable = interactable });
    }
}
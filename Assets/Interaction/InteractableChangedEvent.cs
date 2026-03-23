using Character;
using Core.Events;

namespace Interaction
{
    public struct InteractableChangedEvent
    {
        public AbstractInteractable Interactable;
        public GameCharacter Character;

        public static void Trigger(AbstractInteractable interactable, GameCharacter character)
        {
            EventBus<InteractableChangedEvent>.Raise(new InteractableChangedEvent
            {
                Interactable = interactable,
                Character    = character,
            });
        }
    }
}
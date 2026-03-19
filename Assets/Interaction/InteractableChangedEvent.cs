using Character;
using MoreMountains.Tools;

namespace Interaction
{
    public struct InteractableChangedEvent
    {
        public AbstractInteractable Interactable;
        public UrCharacter Character;

        private static InteractableChangedEvent e;

        public static void Trigger(AbstractInteractable interactable, UrCharacter character)
        {
            e.Interactable = interactable;
            e.Character = character;
            MMEventManager.TriggerEvent(e);
        }
    }
}
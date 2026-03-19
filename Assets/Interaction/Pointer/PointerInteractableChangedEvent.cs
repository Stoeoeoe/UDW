using MoreMountains.Tools;

namespace Interaction.Pointer
{
    public struct PointerInteractableChangedEvent
    {

        public AbstractInteractable Interactable;
        
        private static PointerInteractableChangedEvent e;
        
        public static void Trigger(AbstractInteractable interactable)
        {
            e.Interactable = interactable;
            MMEventManager.TriggerEvent(e);
        }
        
    }
}
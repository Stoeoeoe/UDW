using Core.Events;

namespace Interaction.Dialogue
{
    public struct DialogueCancelledEvent
    {
        public static void Trigger() => EventBus<DialogueCancelledEvent>.Raise(new DialogueCancelledEvent());
    }
}
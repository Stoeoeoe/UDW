using Core.Events;

namespace Interaction.Tools.Stamina
{
    public struct StaminaDepletedEvent
    {
        public static void Trigger()
            => EventBus<StaminaDepletedEvent>.Raise(new StaminaDepletedEvent());
    }
}
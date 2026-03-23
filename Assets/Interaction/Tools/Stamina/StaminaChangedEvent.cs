using Core.Events;

namespace Interaction.Tools.Stamina
{
    /// <summary>
    /// Raised whenever the character's stamina value changes.
    /// The UI (progress bars, overlays) subscribes to update itself.
    /// </summary>
    public struct StaminaChangedEvent
    {
        public int Current;
        public int Max;

        public static void Trigger(int current, int max)
            => EventBus<StaminaChangedEvent>.Raise(new StaminaChangedEvent { Current = current, Max = max });
    }
}

using Core.Events;
using Character;

namespace Interaction.Tools.Stamina
{
    /// <summary>
    /// Raised whenever the character's stamina value changes.
    /// The UI (progress bars, overlays) subscribes to update itself.
    /// </summary>
    public struct StaminaChangedEvent
    {
        public GameCharacter Character;
        public int Current;
        public int Max;

        public static void Trigger(GameCharacter character, int current, int max)
            => EventBus<StaminaChangedEvent>.Raise(new StaminaChangedEvent { Character = character, Current = current, Max = max });
    }
}

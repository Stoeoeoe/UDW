using Core.Events;

namespace Character
{
    /// <summary>Reports committed health and maximum-health changes, including initialization.</summary>
    public readonly struct HealthChangedEvent
    {
        public readonly GameCharacter Character;
        public readonly int Current;
        public readonly int Max;

        public HealthChangedEvent(GameCharacter character, int current, int max)
        {
            Character = character;
            Current = current;
            Max = max;
        }

        public static void Trigger(GameCharacter character, int current, int max) =>
            EventBus<HealthChangedEvent>.Raise(new HealthChangedEvent(character, current, max));
    }
}

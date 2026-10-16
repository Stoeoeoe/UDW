using Character;

namespace Core.TimeAndWeather
{
    /// <summary>Begins the overnight interval; listeners suspend their own interaction state.</summary>
    public readonly struct DayTransitionStarted
    {
        public MainCharacter Character { get; }
        public DayTransitionStarted(MainCharacter character) => Character = character;
    }

    /// <summary>Ends the overnight interval after either completion or cancellation.</summary>
    public readonly struct DayTransitionFinished
    {
        public MainCharacter Character { get; }
        public DayTransitionFinished(MainCharacter character) => Character = character;
    }
}

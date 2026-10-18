using Character;

namespace Core.TimeAndWeather
{
    /// <summary>Distinguishes choosing bedtime from being forced to end the day.</summary>
    public enum DayEndReason { Sleep, PassedOut }

    /// <summary>The next morning is ready behind the blackout; the character can apply its overnight recovery.</summary>
    public readonly struct OvernightRestCompleted
    {
        public MainCharacter Character { get; }
        public DayEndReason Reason { get; }
        public int BedtimeHour { get; }

        public OvernightRestCompleted(MainCharacter character, DayEndReason reason, int bedtimeHour)
        {
            Character = character;
            Reason = reason;
            BedtimeHour = bedtimeHour;
        }
    }

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

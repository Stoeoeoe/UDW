using Core.Events;

namespace Core.TimeAndWeather
{
    /// <summary>Raised after the in-game clock advances, including a new day.</summary>
    public struct GameTimeChangedEvent
    {
        public long TotalMinutes;

        public static void Trigger(long totalMinutes) =>
            EventBus<GameTimeChangedEvent>.Raise(new GameTimeChangedEvent { TotalMinutes = totalMinutes });
    }
}

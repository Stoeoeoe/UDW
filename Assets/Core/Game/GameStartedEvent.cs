using Core.Events;

namespace Core.Game
{
    /// <summary>A new game has begun, before its first location is entered. Loading a save does not raise it.</summary>
    public struct GameStartedEvent
    {
        public static void Trigger() => EventBus<GameStartedEvent>.Raise(new GameStartedEvent());
    }
}

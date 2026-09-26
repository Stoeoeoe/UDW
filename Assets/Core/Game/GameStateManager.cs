namespace Core.Game
{
    /// <summary>Owns the current game session's state across location scene loads.</summary>
    public sealed class GameStateManager : Singleton<GameStateManager>
    {
        public WorldState World { get; } = new WorldState();
        public PlayerState Player { get; } = new PlayerState();
        public StoryState Story { get; } = new StoryState();
    }
}

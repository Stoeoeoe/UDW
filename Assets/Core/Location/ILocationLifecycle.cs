namespace Core.Location
{
    /// <summary>
    /// Explicit location lifecycle hooks called by LevelManager in deterministic order.
    /// </summary>
    public interface ILocationLifecycle
    {
        /// <summary>
        /// Called by LevelManager after the new scene is loaded and the character is placed.
        /// All location-specific initialization should happen here (bind animators, enable systems, etc.).
        /// </summary>
        void OnLocationEnter(LocationData location);

        /// <summary>
        /// Called by LevelManager before the current scene is unloaded.
        /// Save scene-specific state and clean up references here.
        /// </summary>
        void OnLocationLeave(LocationData location);
    }
}

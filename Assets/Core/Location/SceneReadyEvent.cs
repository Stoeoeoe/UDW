using Core.Events;

namespace Core.Location
{
    /// <summary>
    /// Fired by LevelManager after a scene has loaded and the player has been spawned.
    /// </summary>
    public struct SceneReadyEvent
    {
        public LocationData Location;

        public static void Trigger(LocationData location)
            => EventBus<SceneReadyEvent>.Raise(new SceneReadyEvent { Location = location });
    }
}
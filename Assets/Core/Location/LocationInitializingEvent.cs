using Core.Events;

namespace Core.Location
{
    /// <summary>
    /// Fired by LevelManager before a scene has loaded and the player has been spawned.
    /// </summary>
    public struct SceneLoadingEvent
    {
        public LocationData Location;

        public static void Trigger(LocationData location)
            => EventBus<SceneLoadingEvent>.Raise(new SceneLoadingEvent { Location = location });
    }
}
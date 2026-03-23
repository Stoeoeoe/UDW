using Core.Events;

namespace Core.Location
{
    /// <summary>
    /// Fired by LevelManager just before the current scene is unloaded.
    /// Systems that need to save scene-specific state should listen here.
    /// </summary>
    public struct SceneUnloadingEvent
    {
        public LocationData Location;

        public static void Trigger(LocationData location)
            => EventBus<SceneUnloadingEvent>.Raise(new SceneUnloadingEvent { Location = location });
    }
}

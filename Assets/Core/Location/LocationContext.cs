namespace Core.Location
{
    /// <summary>Current location and readiness, updated by LevelManager during transitions.</summary>
    public sealed class LocationContext
    {
        public LocationData Location { get; internal set; }
        public bool SceneReady { get; internal set; }
    }
}

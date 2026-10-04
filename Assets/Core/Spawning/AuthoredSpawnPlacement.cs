using System;

namespace Core.Spawning
{
    /// <summary>Authored instance identity and its inactive, import-configured template. Not save data.</summary>
    [Serializable]
    public sealed class AuthoredSpawnPlacement
    {
        public string id;
        public SpawnedObject template;
    }
}

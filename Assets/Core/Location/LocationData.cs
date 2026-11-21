using Core.Common;
using UnityEngine;

namespace Core.Location
{
    [CreateAssetMenu(fileName = "LocationData", menuName = "Game/LocationData")]
    [Core.Catalogs.DefinitionResource(IdFormat = Core.Catalogs.DefinitionIdFormat.Any)]
    public class LocationData : Core.Catalogs.DefinitionScriptableObject
    {
        public string label;
        public LocationType locationType = LocationType.Outdoor;
        [Tooltip("Disable weather ambience in this location. Other game sounds are unaffected.")]
        public bool muteWeatherAudio;
        [Tooltip("Scene asset path. Imported maps set this independently of the map ID and display name.")]
        public string scenePath;

        // Hand-authored locations may still use a scene name as their ID.
        public string ScenePath => string.IsNullOrWhiteSpace(scenePath) ? Id : scenePath;
    }
}

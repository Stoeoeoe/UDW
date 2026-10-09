using Core.Common;
using UnityEngine;

namespace Core.Location
{
    [CreateAssetMenu(fileName = "LocationData", menuName = "Game/LocationData")]
    public class LocationData : ScriptableObject
    {
        [NamespacedId] public string id;
        public string label;
        public LocationType locationType = LocationType.Outdoor;
        [Tooltip("Scene asset path. Imported maps set this independently of the map ID and display name.")]
        public string scenePath;

        // Hand-authored locations may still use a scene name as their ID.
        public string ScenePath => string.IsNullOrWhiteSpace(scenePath) ? id : scenePath;
    }
}

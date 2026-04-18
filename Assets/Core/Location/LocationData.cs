using Core.Common;
using UnityEngine;

namespace Core.Location
{
    [CreateAssetMenu(fileName = "LocationData", menuName = "Game/LocationData")]
    public class LocationData : ScriptableObject
    {
        public string id;
        public string label;
        public LocationType locationType = LocationType.Outdoor;
    }
}
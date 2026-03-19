using Core.Common;
using Eflatun.SceneReference;
using UnityEngine;
using UnityEngine.Serialization;

namespace Core.Location
{
    
    [CreateAssetMenu(fileName = "LocationData", menuName = "Game/LocationData")]
    public class LocationData : ScriptableObject
    {
        public string id;
        [FormerlySerializedAs("sceneName")] public SceneReference sceneReference;
        public GameObject tiledMapPrefab;
        public string label;
        public LocationType locationType = LocationType.Outdoor;
    }
}
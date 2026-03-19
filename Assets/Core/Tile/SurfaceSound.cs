using UnityEngine;

namespace Core.Tile
{
    [CreateAssetMenu(fileName = "SurfaceSound", menuName = "Game/SurfaceSound", order = 0)]
    public class SurfaceSound : ScriptableObject
    {
        public AudioClip walkSound;
        public AudioClip runSound;
        public float minPitch = 0.8f;
        public float maxPitch = 1.2f;
    }
}
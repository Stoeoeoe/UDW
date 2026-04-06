using UnityEngine;

namespace Core
{
    public class SystemRoot : MonoBehaviour
    {
        public static SystemRoot Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject); // Duplicate detected, kill this one
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject); 
        }
    }
}
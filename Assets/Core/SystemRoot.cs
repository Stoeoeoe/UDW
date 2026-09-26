using Core.Game;
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

            // Scene-specific test roots and the default prefab share the same state setup.
            if (!TryGetComponent<GameStateManager>(out _))
                gameObject.AddComponent<GameStateManager>();
        }
    }
}

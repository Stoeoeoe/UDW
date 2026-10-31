using Core.Game;
using UI.Shared;
using UnityEngine;

namespace Core
{
    // Reject scene-authored duplicates before any of their services can awaken or register.
    [DefaultExecutionOrder(-2000)]
    public class SystemRoot : MonoBehaviour
    {
        public static SystemRoot Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                gameObject.SetActive(false);
                Destroy(gameObject); // Duplicate detected, kill this one
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);

            // Scene-specific test roots and the default prefab share the same state setup.
            if (!TryGetComponent<GameStateManager>(out _))
                gameObject.AddComponent<GameStateManager>();
            if (!TryGetComponent<UrGUIManager>(out _))
                gameObject.AddComponent<UrGUIManager>();
        }
    }
}

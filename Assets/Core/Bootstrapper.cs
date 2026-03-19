using UnityEngine;

namespace Core
{
    public static class Bootstrapper
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        public static void Execute()
        {
            // Check if a SystemRoot already exists in the scene (for testing specific setups)
            var existingRoot = Object.FindFirstObjectByType<SystemRoot>();

            if (existingRoot != null)
            {
                return; // A root exists (manually placed), so we don't need to spawn one
            }

            // Load the default prefab from the Resources folder
            var rootPrefab = Resources.Load<GameObject>("SystemRoot");

            if (rootPrefab != null)
            {
                // Instantiate and rename it to keep the Hierarchy clean
                var instance = Object.Instantiate(rootPrefab);
                instance.name = "SystemRoot (Auto)";
                Object.DontDestroyOnLoad(instance);
            }
            else
            {
                Debug.LogError("SystemRoot prefab not found in Resources folder!");
            }
        }
    }
}
using System.Collections.Generic;
using UnityEngine;

namespace Core.Catalogs
{
    /// <summary>Loads individual catalog assets, never scans definition folders.</summary>
    public static class CatalogResources
    {
        private static readonly Dictionary<string, ScriptableObject> Loaded = new();

        public static T Load<T>(string resourceName) where T : ScriptableObject
        {
            if (!Loaded.TryGetValue(resourceName, out var asset) || !asset)
            {
                asset = Resources.Load<T>(resourceName);
                if (asset) Loaded[resourceName] = asset;
            }
            return asset as T;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void Reset() => Loaded.Clear();
    }
}

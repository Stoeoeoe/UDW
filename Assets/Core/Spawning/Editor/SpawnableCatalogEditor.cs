using Core.Catalogs.Editor;
using UnityEditor;

namespace Core.Spawning.Editor
{
    /// <summary>Existing menu entry delegates to the shared discovery pipeline.</summary>
    internal static class SpawnableCatalogEditor
    {
        internal const string CatalogPath = "Assets/Content/SpawnableCatalog.asset";

        [MenuItem("Tools/Spawning/Refresh Catalogs")]
        private static void RefreshAll() => CatalogDiscovery.RefreshAll();
    }
}

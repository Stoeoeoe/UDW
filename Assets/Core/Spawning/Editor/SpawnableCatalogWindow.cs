using Core.Catalogs.Editor;
using UnityEditor;

namespace Core.Spawning.Editor
{
    internal static class SpawnableCatalogWindow
    {
        [MenuItem("Tools/Spawning/Catalog")]
        private static void Open() => CatalogWindow.OpenFor(typeof(SpawnedObject));
    }
}

using Sirenix.OdinInspector.Editor;
using UnityEditor;
using UnityEngine;

namespace Core.Spawning.Editor
{
    internal static class SpawnableCatalogWindow
    {
        [MenuItem("Tools/Spawning/Catalog")]
        private static void Open()
        {
            var catalog = AssetDatabase.LoadAssetAtPath<SpawnableCatalog>(SpawnableCatalogEditor.CatalogPath);
            if (!catalog)
            {
                Debug.LogWarning("Create the catalog first under " + SpawnableCatalogEditor.CatalogPath + ".");
                return;
            }

            var window = OdinEditorWindow.InspectObject(catalog);
            window.titleContent = new GUIContent("Spawnable Catalog");
            window.minSize = new Vector2(420f, 250f);
        }
    }
}

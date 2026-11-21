using System;
using System.Linq;
using Sirenix.OdinInspector;
using Sirenix.OdinInspector.Editor;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Catalogs.Editor
{
    internal static class CatalogWindow
    {
        [MenuItem("Tools/Catalogs/Browse")]
        private static void Open() => OpenFor(null);

        internal static void OpenFor(Type definitionType)
        {
            var window = OdinEditorWindow.InspectObject(new CatalogBrowser(definitionType));
            window.titleContent = new GUIContent("Definition Catalogs");
            window.minSize = new Vector2(600f, 350f);
        }

        private sealed class CatalogBrowser
        {
            [ShowInInspector, ReadOnly]
            public DefinitionCatalog Catalog { get; } = DefaultCatalogAssets.Load();
            public CatalogBrowser(Type definitionType)
            {
                DefinitionType = definitionType;
                SelectCatalog();
            }
            [ShowInInspector, ValueDropdown(nameof(DefinitionTypes)), OnValueChanged(nameof(SelectCatalog))]
            public Type DefinitionType { get; set; }
            private Type[] DefinitionTypes => DefinitionCatalog.DefinitionTypes.ToArray();
            [ShowInInspector, ReadOnly] public string DiscoveryPath => DefinitionType != null
                ? DefinitionCatalog.DiscoveryPath(DefinitionType) : "All definition types";
            [ShowInInspector, TableList(IsReadOnly = true, AlwaysExpanded = true), Searchable]
            public EntryView[] Entries { get; private set; } = Array.Empty<EntryView>();
            private void SelectCatalog() => Entries = Catalog
                ? Catalog.Entries.Where(entry => DefinitionType == null || DefinitionType.IsInstanceOfType(entry.Definition))
                    .Select(entry => new EntryView(Catalog, entry)).ToArray() : Array.Empty<EntryView>();

            [Button("Refresh Discovery"), EnableIf(nameof(HasCatalog))]
            private void Refresh()
            {
                try { CatalogDiscovery.Refresh(Catalog); SelectCatalog(); }
                catch (Exception exception) { Debug.LogError(exception.Message, Catalog); }
            }
            private bool HasCatalog => Catalog;
        }

        private sealed class EntryView
        {
            private readonly DefinitionCatalog _catalog;
            private readonly Object _definition;
            public EntryView(DefinitionCatalog catalog, CatalogEntry entry) { _catalog = catalog; _definition = entry.Definition; }
            [ShowInInspector, ReadOnly] public string Id => _definition ? DefinitionCatalog.GetId(_definition) : "Missing asset";
            [ShowInInspector, ReadOnly, InlineEditor] public Object Definition => _definition;
            [ShowInInspector] public bool Enabled
            {
                get => _catalog.Entries.FirstOrDefault(entry => entry.Definition == _definition)?.Enabled ?? false;
                set
                {
                    Undo.RecordObject(_catalog, "Change catalog selection");
                    _catalog.SetEnabled(_definition, value);
                    EditorUtility.SetDirty(_catalog);
                }
            }
        }
    }
}

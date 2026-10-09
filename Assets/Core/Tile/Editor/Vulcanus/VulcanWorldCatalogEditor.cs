using System.Collections.Generic;
using Core.Tile.Vulcanus;
using UnityEditor;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    [CustomEditor(typeof(VulcanusWorldCatalog))]
    public class VulcanusWorldCatalogEditor : UnityEditor.Editor
    {
        private SerializedProperty _project;
        private SerializedProperty _entityPrefabMappings;
        private SerializedProperty _mapBindings;

        private string _lastSyncSummary;

        private void OnEnable()
        {
            _project = serializedObject.FindProperty("project");
            _entityPrefabMappings = serializedObject.FindProperty("entityPrefabMappings");
            _mapBindings = serializedObject.FindProperty("mapBindings");
        }

        public override void OnInspectorGUI()
        {
            serializedObject.Update();

            EditorGUILayout.LabelField("Source", EditorStyles.boldLabel);
            EditorGUILayout.PropertyField(_project);

            using (new EditorGUILayout.HorizontalScope())
            using (new EditorGUI.DisabledScope(_project.objectReferenceValue == null))
            {
                if (GUILayout.Button("Sync Rows From Project"))
                    SyncFromProject(autoAssignMissingEntityPrefabs: false);

                if (GUILayout.Button("Sync + Auto Assign Single Prefab Matches"))
                    SyncFromProject(autoAssignMissingEntityPrefabs: true);
            }

            if (!string.IsNullOrWhiteSpace(_lastSyncSummary))
                EditorGUILayout.HelpBox(_lastSyncSummary, MessageType.Info);

            EditorGUILayout.Space();
            EditorGUILayout.PropertyField(_entityPrefabMappings, includeChildren: true);
            EditorGUILayout.PropertyField(_mapBindings, includeChildren: true);

            serializedObject.ApplyModifiedProperties();
        }

        private void SyncFromProject(bool autoAssignMissingEntityPrefabs)
        {
            serializedObject.ApplyModifiedProperties();

            var catalog = target as VulcanusWorldCatalog;
            if (catalog == null) return;

            var project = catalog.Project;
            if (project == null) { _lastSyncSummary = "Assign a VulcanusProject first."; return; }

            var projectAssetPath = AssetDatabase.GetAssetPath(project);
            var entityDefinitions = VulcanusProjectRegistry.FindEntityDefinitionsForProject(projectAssetPath);

            var warnings = new List<string>();
            var unresolved = 0;

            var entityMappings = VulcanusEditorUtils.BuildEntityMappings(
                entityDefinitions,
                catalog.EntityPrefabMappings,
                warnings,
                autoAssignMissingEntityPrefabs,
                count => unresolved = count);

            var mapBindings = BuildMapBindings(project, catalog.MapBindings,
                                       out var discoveredMapCount, out var unresolvedMapPrefabs);

            Undo.RecordObject(catalog, "Sync Vulcanus World Catalog From Project");
            catalog.ApplySyncData(entityMappings, mapBindings);
            EditorUtility.SetDirty(catalog);
            AssetDatabase.SaveAssets();

            _lastSyncSummary =
                $"Synced {entityMappings.Length} entity rows and {mapBindings.Length} map rows from project '{project.ProjectName}'. " +
                $"Unresolved entities: {unresolved}. Maps without prefab asset: {unresolvedMapPrefabs}. Discovered map files: {discoveredMapCount}.";

            serializedObject.Update();
            Repaint();
        }


        private static VulcanusWorldCatalog.MapBinding[] BuildMapBindings(
            VulcanusProject project, VulcanusWorldCatalog.MapBinding[] existingBindings,
            out int discoveredMapCount, out int unresolvedMapPrefabs) =>
            VulcanusWorldCatalogDiscovery.BuildMapBindings(project, existingBindings,
                out discoveredMapCount, out unresolvedMapPrefabs);
    }
}
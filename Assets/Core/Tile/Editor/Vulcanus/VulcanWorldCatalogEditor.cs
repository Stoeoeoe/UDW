using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Core.Location;
using Core.Tile.Vulcanus;
using UnityEditor;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    [CustomEditor(typeof(VulcanusWorldCatalog))]
    public class VulcanusWorldCatalogEditor : UnityEditor.Editor
    {
        private SerializedProperty _project;
        private SerializedProperty _locationLinkPrefab;
        private SerializedProperty _entityPrefabMappings;
        private SerializedProperty _locationMappings;
        private SerializedProperty _mapBindings;

        private string _lastSyncSummary;

        private void OnEnable()
        {
            _project             = serializedObject.FindProperty("project");
            _locationLinkPrefab  = serializedObject.FindProperty("locationLinkPrefab");
            _entityPrefabMappings = serializedObject.FindProperty("entityPrefabMappings");
            _locationMappings    = serializedObject.FindProperty("locationMappings");
            _mapBindings         = serializedObject.FindProperty("mapBindings");
        }

        public override void OnInspectorGUI()
        {
            serializedObject.Update();

            EditorGUILayout.LabelField("Source", EditorStyles.boldLabel);
            EditorGUILayout.PropertyField(_project);

            EditorGUILayout.LabelField("Mappings", EditorStyles.boldLabel);
            EditorGUILayout.PropertyField(_locationLinkPrefab);

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
            EditorGUILayout.PropertyField(_locationMappings, includeChildren: true);
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

            var warnings = new List<string>();
            var unresolved = 0;

            var entityMappings = VulcanusEditorUtils.BuildEntityMappings(
                project.EntityTypes,
                catalog.EntityPrefabMappings,
                warnings,
                autoAssignMissingEntityPrefabs,
                count => unresolved = count);

            var mapBindings      = BuildMapBindings(project, catalog.MapBindings, catalog.LocationMappings,
                                       out var discoveredMapCount, out var unresolvedMapPrefabs);
            var locationMappings = BuildLocationMappings(mapBindings, catalog.LocationMappings);

            Undo.RecordObject(catalog, "Sync Vulcanus World Catalog From Project");
            catalog.ApplySyncData(catalog.LocationLinkPrefab, entityMappings, locationMappings, mapBindings);
            EditorUtility.SetDirty(catalog);
            AssetDatabase.SaveAssets();

            _lastSyncSummary =
                $"Synced {entityMappings.Length} entity rows and {mapBindings.Length} map rows from project '{project.ProjectName}'. " +
                $"Unresolved entities: {unresolved}. Maps without prefab asset: {unresolvedMapPrefabs}. Discovered map files: {discoveredMapCount}.";

            serializedObject.Update();
            Repaint();
        }

        // ── Map binding helpers ───────────────────────────────────────────────

        private static VulcanusWorldCatalog.MapBinding[] BuildMapBindings(
            VulcanusProject project,
            VulcanusWorldCatalog.MapBinding[] existingBindings,
            VulcanusProject.MapLocationMapping[] existingLocationMappings,
            out int discoveredMapCount,
            out int unresolvedMapPrefabs)
        {
            discoveredMapCount  = 0;
            unresolvedMapPrefabs = 0;

            var existingByMapId = Index(existingBindings, b => b.mapId);
            var locationByMapId = Index(
                existingLocationMappings,
                m => m.mapId,
                m => m.locationData);

            var result = new List<VulcanusWorldCatalog.MapBinding>();
            var projectAssetPath = AssetDatabase.GetAssetPath(project);
            var projectRoot = Path.GetDirectoryName(VulcanusJsonImporter.ToAbsolutePath(projectAssetPath));

            if (!string.IsNullOrWhiteSpace(projectRoot) && Directory.Exists(projectRoot))
            {
                var mapFiles = Directory.GetFiles(projectRoot, "*.map.json", SearchOption.AllDirectories);
                discoveredMapCount = mapFiles.Length;

                foreach (var mapJsonAbsolute in mapFiles)
                {
                    if (!VulcanusJsonImporter.TryAbsoluteToAssetPath(mapJsonAbsolute, out var mapAssetPath))
                        continue;

                    var mapPrefab   = AssetDatabase.LoadAssetAtPath<GameObject>(mapAssetPath);
                    var importedMap = mapPrefab != null ? mapPrefab.GetComponent<VulcanusImportedMap>() : null;

                    var fileName = Path.GetFileName(mapJsonAbsolute);
                    var mapId = importedMap != null && !string.IsNullOrWhiteSpace(importedMap.MapId)
                        ? importedMap.MapId
                        : fileName.EndsWith(".map.json", StringComparison.OrdinalIgnoreCase)
                            ? fileName[..^".map.json".Length]
                            : Path.GetFileNameWithoutExtension(fileName);

                    if (string.IsNullOrWhiteSpace(mapId)) continue;

                    existingByMapId.TryGetValue(mapId, out var oldBinding);
                    locationByMapId.TryGetValue(mapId, out var mappedLocation);

                    if (mapPrefab == null) unresolvedMapPrefabs++;

                    // Prefer the LocationData sub-asset baked into the map import over any manually assigned reference.
                    var subAssetLocation = AssetDatabase.LoadAllAssetsAtPath(mapAssetPath)
                        .OfType<LocationData>()
                        .FirstOrDefault();

                    result.Add(new VulcanusWorldCatalog.MapBinding
                    {
                        mapId        = mapId,
                        mapPrefab    = mapPrefab,
                        locationData = subAssetLocation ?? oldBinding?.locationData ?? mappedLocation
                    });
                    existingByMapId.Remove(mapId);
                }
            }

            // Preserve manual rows not discovered from files.
            foreach (var leftover in existingByMapId.Values.Where(b => b != null))
                result.Add(leftover);

            result.Sort((a, b) => string.Compare(a?.mapId, b?.mapId, StringComparison.OrdinalIgnoreCase));
            return result.ToArray();
        }

        private static VulcanusProject.MapLocationMapping[] BuildLocationMappings(
            VulcanusWorldCatalog.MapBinding[] mapBindings,
            VulcanusProject.MapLocationMapping[] existing)
        {
            var byMapId = Index(existing, m => m.mapId);

            foreach (var binding in mapBindings ?? Array.Empty<VulcanusWorldCatalog.MapBinding>())
            {
                if (binding == null || string.IsNullOrWhiteSpace(binding.mapId)) continue;
                byMapId[binding.mapId] = new VulcanusProject.MapLocationMapping
                {
                    mapId        = binding.mapId,
                    locationData = binding.locationData
                };
            }

            return byMapId.Values
                .OrderBy(v => v.mapId, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        // ── Generic index helpers ─────────────────────────────────────────────

        private static Dictionary<string, T> Index<T>(
            T[] items,
            Func<T, string> keySelector)
            where T : class
        {
            var dict = new Dictionary<string, T>(StringComparer.OrdinalIgnoreCase);
            if (items == null) return dict;
            foreach (var item in items)
                if (item != null && !string.IsNullOrWhiteSpace(keySelector(item)))
                    dict[keySelector(item)] = item;
            return dict;
        }

        private static Dictionary<string, TValue> Index<T, TValue>(
            T[] items,
            Func<T, string> keySelector,
            Func<T, TValue> valueSelector)
            where T : class
        {
            var dict = new Dictionary<string, TValue>(StringComparer.OrdinalIgnoreCase);
            if (items == null) return dict;
            foreach (var item in items)
                if (item != null && !string.IsNullOrWhiteSpace(keySelector(item)))
                    dict[keySelector(item)] = valueSelector(item);
            return dict;
        }
    }
}

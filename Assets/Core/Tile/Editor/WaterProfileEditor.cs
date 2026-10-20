using System;
using System.Collections.Generic;
using Core.Tile.Water;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Core.Tile.Editor
{
    [CustomEditor(typeof(WaterProfile))]
    internal sealed class WaterProfileEditor : UnityEditor.Editor
    {
        public override void OnInspectorGUI()
        {
            var changed = DrawDefaultInspector();
            var profile = (WaterProfile)target;
            try
            {
                profile.Validate();
                if (changed)
                    foreach (var body in FindObjectsByType<WaterBody>(FindObjectsInactive.Include))
                        if (body.Profile == profile) body.ApplyProfile();
            }
            catch (InvalidOperationException exception) { EditorGUILayout.HelpBox(exception.Message, MessageType.Error); }
        }
    }

    [CustomEditor(typeof(WaterBody))]
    internal sealed class WaterBodyEditor : UnityEditor.Editor
    {
        public override void OnInspectorGUI()
        {
            var changed = DrawDefaultInspector();
            var body = (WaterBody)target;
            try
            {
                body.Validate();
                if (changed) body.ApplyProfile();
            }
            catch (InvalidOperationException exception) { EditorGUILayout.HelpBox(exception.Message, MessageType.Error); }
        }
    }

    internal sealed class WaterValidation : IPreprocessBuildWithReport, IProcessSceneWithReport
    {
        public int callbackOrder => 0;

        [InitializeOnLoadMethod]
        private static void Initialize()
        {
            EditorApplication.playModeStateChanged += state =>
            {
                if (state != PlayModeStateChange.ExitingEditMode) return;
                try
                {
                    ValidateProfiles();
                    foreach (var body in UnityEngine.Object.FindObjectsByType<WaterBody>(FindObjectsInactive.Include))
                        body.Validate();
                    ValidateSources(UnityEngine.Object.FindObjectsByType<WaterReflectionSource>(FindObjectsInactive.Include));
                }
                catch (InvalidOperationException exception)
                {
                    Debug.LogError(exception.Message);
                    EditorApplication.isPlaying = false;
                }
            };
        }

        private static void ValidateProfiles()
        {
            var needsReflections = false;
            foreach (var guid in AssetDatabase.FindAssets("t:WaterProfile"))
            {
                var profile = AssetDatabase.LoadAssetAtPath<WaterProfile>(AssetDatabase.GUIDToAssetPath(guid));
                profile.Validate();
                needsReflections |= profile.objectReflectionsEnabled;
            }
            if (needsReflections) ValidateReflectionRenderer();
            // Inspect dependencies first: loading every unrelated demo/UI prefab brings its
            // textures into memory even though none of those assets participate in reflections.
            string sourceScriptPath = null;
            foreach (var guid in AssetDatabase.FindAssets($"t:MonoScript {nameof(WaterReflectionSource)}"))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (AssetDatabase.LoadAssetAtPath<MonoScript>(path).GetClass() == typeof(WaterReflectionSource))
                {
                    sourceScriptPath = path;
                    break;
                }
            }
            if (sourceScriptPath == null) throw new InvalidOperationException("The required WaterReflectionSource script asset is missing.");
            // Character and spawnable prefab references must be valid before their first spawn.
            foreach (var guid in AssetDatabase.FindAssets("t:Prefab"))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (Array.IndexOf(AssetDatabase.GetDependencies(path), sourceScriptPath) < 0) continue;
                ValidateSources(AssetDatabase.LoadAssetAtPath<GameObject>(path).GetComponentsInChildren<WaterReflectionSource>(true));
            }
        }

        private static void ValidateSources(IEnumerable<WaterReflectionSource> sources)
        {
            var owners = new Dictionary<SpriteRenderer, WaterReflectionSource>();
            foreach (var source in sources)
            {
                source.Validate();
                foreach (var sprite in source.Sprites)
                {
                    if (owners.TryGetValue(sprite, out var other))
                        throw new InvalidOperationException($"Sprite '{sprite.name}' belongs to both reflection sources '{other.name}' and '{source.name}'.");
                    owners.Add(sprite, source);
                }
            }
        }

        private static void ValidateReflectionRenderer()
        {
            if (GraphicsSettings.currentRenderPipeline is not UniversalRenderPipelineAsset pipeline)
                throw new InvalidOperationException("Object reflections require a URP 2D renderer with WaterReflectionRendererFeature.");
            var renderers = new SerializedObject(pipeline).FindProperty("m_RendererDataList");
            var found2D = false;
            for (var i = 0; i < renderers.arraySize; i++)
            {
                if (renderers.GetArrayElementAtIndex(i).objectReferenceValue is not Renderer2DData renderer) continue;
                found2D = true;
                var count = 0;
                foreach (var feature in renderer.rendererFeatures)
                    if (feature is WaterReflectionRendererFeature reflection && reflection.isActive)
                    {
                        reflection.Validate();
                        count++;
                    }
                if (count != 1)
                    throw new InvalidOperationException($"2D renderer '{renderer.name}' requires exactly one active WaterReflectionRendererFeature for enabled object reflections.");
            }
            if (!found2D) throw new InvalidOperationException("Object reflections require a configured URP 2D renderer.");
        }

        public void OnPreprocessBuild(BuildReport report)
        {
            try { ValidateProfiles(); }
            catch (InvalidOperationException exception) { throw new BuildFailedException(exception.Message); }
        }

        public void OnProcessScene(Scene scene, BuildReport report)
        {
            var sources = new List<WaterReflectionSource>();
            foreach (var root in scene.GetRootGameObjects())
            {
                foreach (var body in root.GetComponentsInChildren<WaterBody>(true))
                    body.Validate();
                sources.AddRange(root.GetComponentsInChildren<WaterReflectionSource>(true));
            }
            ValidateSources(sources);
        }
    }
}

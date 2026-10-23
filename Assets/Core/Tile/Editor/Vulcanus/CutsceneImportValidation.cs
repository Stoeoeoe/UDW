using System;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using Core.Scripting;
using Core.Catalogs;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>A broken current source must block play/build, even if Unity retains an older import artifact.</summary>
    internal sealed class CutsceneImportValidation : IPreprocessBuildWithReport
    {
        public int callbackOrder => 0;

        [InitializeOnLoadMethod]
        private static void Initialize()
        {
            EditorApplication.playModeStateChanged += state =>
            {
                if (state != PlayModeStateChange.ExitingEditMode) return;
                try { ValidateSources(); }
                catch (Exception error) { Debug.LogError(error.Message); EditorApplication.isPlaying = false; }
            };
        }

        public void OnPreprocessBuild(BuildReport report)
        {
            try { ValidateSources(); }
            catch (Exception error) { throw new BuildFailedException(error.Message); }
        }

        internal static void ValidateSources()
        {
            foreach (var path in AssetDatabase.GetAllAssetPaths())
            {
                if (path.StartsWith("Assets/", StringComparison.Ordinal) && path.EndsWith(".vmap", StringComparison.OrdinalIgnoreCase))
                {
                    var map = VulcanusImportHelpers.LoadDto<MapDto>(path);
                    var triggers = map.SpatialPrimitives?.Triggers;
                    if (triggers != null) foreach (var trigger in triggers)
                    {
                        if (trigger.Type != "cutscene") continue;
                        var definition = CatalogResources.Load<CutsceneCatalog>(CutsceneCatalog.ResourceName).Get(trigger.CutsceneId);
                        if (!definition || !StringComparer.OrdinalIgnoreCase.Equals(definition.MapId, map.Id))
                            throw new InvalidOperationException($"{path}: trigger '{trigger.Id}' requires its enabled cutscene '{trigger.CutsceneId}' on this map.");
                    }
                }
                if (!path.StartsWith("Assets/", StringComparison.Ordinal) ||
                    !path.EndsWith(".runtime.cutscene.json", StringComparison.OrdinalIgnoreCase)) continue;
                CutsceneImporter.ValidateSource(path);
                if (!AssetDatabase.LoadAssetAtPath<Core.Scripting.CutsceneDefinition>(path))
                    throw new InvalidOperationException($"{path}: requires a successful cutscene import before play/build.");
            }
        }
    }
}

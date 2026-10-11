using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Core.Common.Editor
{
    public sealed class ValidatedAssetValidation : IPreprocessBuildWithReport
    {
        // Report all configuration failures before catalog discovery can stop at its first error.
        public int callbackOrder => -1000;

        public static IReadOnlyList<ConfigurationError> ValidateProject()
        {
            var errors = new List<ConfigurationError>();
            // Scan files containing validated assets, including sub-assets and assets
            // outside Resources, catalogs, or the current scene's dependencies.
            var paths = AssetDatabase.FindAssets("t:ValidatedScriptableObject", new[] { "Assets" })
                .Select(AssetDatabase.GUIDToAssetPath).Distinct().OrderBy(path => path, StringComparer.Ordinal);
            foreach (var path in paths)
                foreach (var asset in AssetDatabase.LoadAllAssetsAtPath(path).OfType<ValidatedScriptableObject>())
                    errors.AddRange(asset.ValidateConfiguration());
            return errors.AsReadOnly();
        }

        [MenuItem("Tools/Validation/Validate ScriptableObject Configuration")]
        public static void ValidateProjectCommand()
        {
            var errors = ValidateProject();
            // Keep Console navigation on the offending asset rather than this command's source.
            foreach (var error in errors)
                Debug.LogFormat(LogType.Error, LogOption.NoStacktrace, error.Asset, "{0}", error);
            if (errors.Count == 0) Debug.Log("ScriptableObject configuration validation passed.");
            else Debug.LogError($"ScriptableObject configuration validation failed: {errors.Count} error(s). See asset errors above.");
        }

        public void OnPreprocessBuild(BuildReport report)
        {
            var errors = ValidateProject();
            if (errors.Count == 0) return;
            throw new BuildFailedException("Invalid ScriptableObject configuration:\n" +
                string.Join("\n", errors.Select(error => error.ToString())));
        }
    }
}

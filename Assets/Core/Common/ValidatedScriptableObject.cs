using System.Collections.Generic;
using UnityEngine;

namespace Core.Common
{
    /// <summary>
    /// Configuration is validated at authoring/build boundaries and must not be modified
    /// at runtime. Gameplay availability checks belong in gameplay code, not here.
    /// </summary>
    public abstract class ValidatedScriptableObject : ScriptableObject
    {
        public abstract IReadOnlyList<ConfigurationError> ValidateConfiguration();

        /// <summary>Validate new runtime/mod content once before exposing it to gameplay.</summary>
        public void RequireValidConfiguration()
        {
            var errors = ValidateConfiguration();
            if (errors.Count == 0) return;
            throw new System.ArgumentException(string.Join("\n", errors));
        }

#if UNITY_EDITOR
        protected virtual void OnValidate()
        {
            // Configuration errors belong to the asset, not the validation call site.
            foreach (var error in ValidateConfiguration())
                Debug.LogFormat(LogType.Error, LogOption.NoStacktrace, error.Asset, "{0}", error);
        }
#endif
    }

    /// <summary>Declares the asset's validator without a registry or serialized validator reference.</summary>
    public abstract class ValidatedScriptableObject<TValidator> : ValidatedScriptableObject
        where TValidator : IScriptableObjectValidator, new()
    {
        private static readonly TValidator Validator = new();

        // Item subclasses retain their shared item hierarchy while selecting a subtype validator.
        protected virtual IScriptableObjectValidator ConfigurationValidator => Validator;

        public sealed override IReadOnlyList<ConfigurationError> ValidateConfiguration() =>
            ConfigurationValidator.Validate(this);
    }

    public sealed class ConfigurationError
    {
        public ValidatedScriptableObject Asset { get; }
        public string Setting { get; }
        public string Message { get; }

        public ConfigurationError(ValidatedScriptableObject asset, string setting, string message)
        {
            Asset = asset;
            Setting = setting;
            Message = message;
        }

        public override string ToString()
        {
            var identity = $"{Asset.name} ({Asset.GetType().Name})";
#if UNITY_EDITOR
            var path = UnityEditor.AssetDatabase.GetAssetPath(Asset);
            if (!string.IsNullOrEmpty(path)) identity = $"{path} [{identity}]";
#endif
            return $"{identity}: {Setting}: {Message}";
        }
    }
}

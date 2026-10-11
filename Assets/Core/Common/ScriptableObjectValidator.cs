using System;
using System.Collections.Generic;

namespace Core.Common
{
    internal static class ConfigurationValidationTraversal
    {
        [ThreadStatic] private static HashSet<ValidatedScriptableObject> _visiting;
        public static bool Enter(ValidatedScriptableObject asset) => (_visiting ??= new()).Add(asset);
        public static void Leave(ValidatedScriptableObject asset) => _visiting.Remove(asset);
    }

    public interface IScriptableObjectValidator
    {
        IReadOnlyList<ConfigurationError> Validate(ValidatedScriptableObject asset);
    }

    /// <summary>Stateless configuration rules for one asset type, usable independently of Unity callbacks.</summary>
    public abstract class ScriptableObjectValidator<TAsset> : IScriptableObjectValidator
        where TAsset : ValidatedScriptableObject
    {
        public IReadOnlyList<ConfigurationError> Validate(TAsset asset)
        {
            var errors = new List<ConfigurationError>();
            if (!ConfigurationValidationTraversal.Enter(asset))
            {
                errors.Add(new ConfigurationError(asset, "configuration", "Referenced configuration contains a reference cycle."));
                return errors.AsReadOnly();
            }
            try
            {
                AttributeConfigurationValidation.Collect(asset, errors);
                CollectConfigurationErrors(asset, errors);
            }
            finally { ConfigurationValidationTraversal.Leave(asset); }
            return errors.AsReadOnly();
        }

        IReadOnlyList<ConfigurationError> IScriptableObjectValidator.Validate(ValidatedScriptableObject asset) =>
            Validate((TAsset)asset);

        protected abstract void CollectConfigurationErrors(TAsset asset, List<ConfigurationError> errors);

        protected static void Report(List<ConfigurationError> errors, TAsset asset, string setting, string message) =>
            errors.Add(new ConfigurationError(asset, setting, message));
    }
}

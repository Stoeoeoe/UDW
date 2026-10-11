using System.Collections.Generic;

namespace Core.Common
{
    internal static class ConfigurationRules
    {
        public static bool IsFinite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);

        public static void ValidateReference(ValidatedScriptableObject owner, string setting,
            ValidatedScriptableObject reference, List<ConfigurationError> errors)
        {
            if (!reference)
            {
                errors.Add(new ConfigurationError(owner, setting, "Assign a reference."));
                return;
            }
            foreach (var error in reference.ValidateConfiguration())
                errors.Add(new ConfigurationError(owner, setting + "." + error.Setting,
                    $"Referenced asset '{reference.name}': {error.Message}"));
        }
    }
}

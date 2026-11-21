using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Core.Common;
using UnityEngine;

namespace Core.Catalogs
{
    /// <summary>Shared identity and authoring validation for cataloged ScriptableObject definitions.</summary>
    public abstract class DefinitionScriptableObject : ValidatedScriptableObject, IDefinition
    {
        [field: SerializeField, NamespacedId]
        public string Id { get; private set; }

        private static readonly DefaultValidator Validator = new();
        protected virtual IScriptableObjectValidator ConfigurationValidator => Validator;

        /// <summary>Sets identity while constructing a definition, before exposing it to gameplay.</summary>
        public void SetId(string id) => Id = id;

        public override IReadOnlyList<ConfigurationError> ValidateConfiguration()
        {
            var errors = ConfigurationValidator.Validate(this).ToList();
            var format = DefinitionCatalog.FamilyOf(GetType()).GetCustomAttribute<DefinitionResourceAttribute>().IdFormat;
            var valid = format switch
            {
                DefinitionIdFormat.Any => DefinitionIdRules.IsPresent(Id),
                DefinitionIdFormat.Namespaced => DefinitionIdRules.IsNamespaced(Id),
                DefinitionIdFormat.LowercaseNamespaced => DefinitionIdRules.IsLowercaseNamespaced(Id),
                _ => throw new InvalidOperationException($"Unknown definition ID format '{format}'.")
            };
            if (!valid)
                errors.Add(new ConfigurationError(this, nameof(Id), format == DefinitionIdFormat.Any
                    ? "Assign a stable, nonblank ID."
                    : format == DefinitionIdFormat.Namespaced ? "Assign a namespace:name ID." : "Assign a lowercase namespace:name ID."));
            return errors;
        }

        private sealed class DefaultValidator : ScriptableObjectValidator<DefinitionScriptableObject>
        {
            protected override void CollectConfigurationErrors(DefinitionScriptableObject asset, List<ConfigurationError> errors) { }
        }
    }

    public abstract class DefinitionScriptableObject<TValidator> : DefinitionScriptableObject
        where TValidator : IScriptableObjectValidator, new()
    {
        private static readonly TValidator Validator = new();
        protected override IScriptableObjectValidator ConfigurationValidator => Validator;
    }
}

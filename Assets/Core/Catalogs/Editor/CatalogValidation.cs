using System;
using System.Linq;
using System.Reflection;
using System.Runtime.ExceptionServices;
using UnityEditor;
using Core.Common;
using Object = UnityEngine.Object;

namespace Core.Catalogs.Editor
{
    /// <summary>
    /// Definition identity checks at the authoring boundary, never on runtime reads. Checks of references between a
    /// catalog's definitions and content authored elsewhere live with their feature; this only dispatches to them.
    /// </summary>
    internal static class CatalogValidation
    {
        public static void Validate(DefinitionCatalog catalog, Object[] definitions)
        {
            var references = new ReferenceValidation();
            foreach (var definition in definitions)
            {
                if (!definition) throw new InvalidOperationException($"Catalog '{catalog.name}' has a missing reference.");
                var family = DefinitionCatalog.FamilyOf(definition.GetType());
                if (definition is not IDefinition)
                    throw new InvalidOperationException($"Definition family '{family.Name}' must implement IDefinition.");
                if (!DefinitionIdRules.IsPresent(DefinitionCatalog.GetId(definition)))
                    throw new InvalidOperationException($"Catalog '{catalog.name}': '{definition.name}' needs an ID.");
                if (definition is not ValidatedScriptableObject asset) continue;
                ValidateConfiguration(asset);
                var problem = references.Problems(asset).FirstOrDefault();
                if (problem != null) throw new InvalidOperationException(problem);
            }
            var duplicate = definitions.GroupBy(definition =>
                (DefinitionCatalog.FamilyOf(definition.GetType()), DefinitionCatalog.GetId(definition)))
                .FirstOrDefault(group => group.Count() > 1);
            if (duplicate != null) throw new InvalidOperationException($"Catalog '{catalog.name}' has duplicate ID '{duplicate.Key.Item2}' in {duplicate.Key.Item1.Name}.");

            foreach (var method in TypeCache.GetMethodsWithAttribute<DefinitionValidationAttribute>())
            {
                var type = method.GetCustomAttribute<DefinitionValidationAttribute>().Type;
                var matching = definitions.Where(type.IsInstanceOfType).ToArray();
                if (matching.Length == 0) continue;
                var typed = Array.CreateInstance(type, matching.Length);
                Array.Copy(matching, typed, matching.Length);
                try { method.Invoke(null, new object[] { typed }); }
                catch (TargetInvocationException exception) { ExceptionDispatchInfo.Capture(exception.InnerException).Throw(); }
            }
        }

        private static void ValidateConfiguration(ValidatedScriptableObject asset)
        {
            var errors = asset.ValidateConfiguration();
            if (errors.Count > 0)
                throw new InvalidOperationException(string.Join("\n", errors.Select(error => error.ToString())));
        }
    }
}

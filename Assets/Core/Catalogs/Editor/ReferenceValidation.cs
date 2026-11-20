using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Core.Common;

namespace Core.Catalogs.Editor
{
    /// <summary>
    /// Checks <see cref="Validation.ReferenceAttribute"/> IDs of a definition and its <see cref="Validation.NestedAttribute"/>
    /// members against the definitions that exist. Catalog refresh runs it, since an asset cannot see other assets and
    /// the referenced content can change without reimporting it.
    /// </summary>
    internal sealed class ReferenceValidation
    {
        private const string BackingFieldAffix = ">k__BackingField";
        private readonly Func<Type, IEnumerable<string>> _idsOf;
        private readonly Dictionary<Type, HashSet<string>> _known = new();

        /// <summary>Checks against the definitions found in the project.</summary>
        public ReferenceValidation() : this(DiscoveredIds) { }

        public ReferenceValidation(Func<Type, IEnumerable<string>> idsOf) => _idsOf = idsOf;

        public IEnumerable<string> Problems(ValidatedScriptableObject definition) => Walk(definition, definition, "");

        private IEnumerable<string> Walk(ValidatedScriptableObject owner, object instance, string path)
        {
            for (var type = instance.GetType(); type != null; type = type.BaseType)
                foreach (var field in type.GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly))
                {
                    var rules = field.GetCustomAttributes<Validation.RuleAttribute>(true).ToArray();
                    if (rules.Length == 0 || field.GetValue(instance) is not { } value) continue;
                    var name = field.Name.StartsWith('<') && field.Name.EndsWith(BackingFieldAffix, StringComparison.Ordinal)
                        ? field.Name.Substring(1, field.Name.Length - BackingFieldAffix.Length - 1)
                        : field.Name;
                    foreach (var rule in rules)
                    {
                        if (rule is Validation.ReferenceAttribute reference && value is string id && id.Length > 0 && !Known(reference).Contains(id))
                            yield return $"{owner.GetType().Name} '{owner.name}': {path}{name} uses the unknown {reference.Target.Name} '{id}'.";
                        if (rule is not Validation.NestedAttribute) continue;
                        if (value is IList entries)
                            for (var i = 0; i < entries.Count; i++)
                                foreach (var problem in entries[i] == null ? Array.Empty<string>() : Walk(owner, entries[i], $"{path}{name}[{i}]."))
                                    yield return problem;
                        else
                            foreach (var problem in Walk(owner, value, $"{path}{name}."))
                                yield return problem;
                    }
                }
        }

        private HashSet<string> Known(Validation.ReferenceAttribute reference)
        {
            if (!_known.TryGetValue(reference.Target, out var ids))
                _known[reference.Target] = ids = new HashSet<string>(_idsOf(reference.Target), StringComparer.Ordinal);
            return ids;
        }

        private static IEnumerable<string> DiscoveredIds(Type target)
        {
            var id = target.GetProperty("Id") ?? throw new InvalidOperationException($"{target.Name} has no Id to reference.");
            return CatalogAssetDiscovery.Find("Assets", target).Select(definition => (string)id.GetValue(definition)).ToArray();
        }
    }
}

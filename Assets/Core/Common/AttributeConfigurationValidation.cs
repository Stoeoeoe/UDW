using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using UnityEngine;

namespace Core.Common
{
    /// <summary>Domain rules owned by a plain configuration value, reached only through Nested.</summary>
    public interface INestedConfigurationValidator
    {
        void CollectConfigurationErrors(Action<string, string> report);
    }

    internal static class AttributeConfigurationValidation
    {
        private sealed class MemberRules
        {
            public MemberInfo Member;
            public string Setting;
            public Validation.RuleAttribute[] Rules;
        }

        // Cache metadata only: values and error lists are read afresh on every validation.
        private static readonly ConcurrentDictionary<Type, MemberRules[]> Cache = new();
        private sealed class NamedMember { public MemberInfo Member; }
        private static readonly ConcurrentDictionary<(Type, string), NamedMember> NamedMembers = new();

        public static void Collect(ValidatedScriptableObject asset, List<ConfigurationError> errors)
        {
            CollectMembers(asset, asset, "", errors, new HashSet<object>(ReferenceComparer.Instance));
        }

        private sealed class ReferenceComparer : IEqualityComparer<object>
        {
            public static readonly ReferenceComparer Instance = new();
            public new bool Equals(object x, object y) => ReferenceEquals(x, y);
            public int GetHashCode(object obj) => RuntimeHelpers.GetHashCode(obj);
        }

        private static void CollectMembers(ValidatedScriptableObject asset, object instance, string prefix,
            List<ConfigurationError> errors, HashSet<object> visiting, string traversalMessage = null)
        {
            if (!visiting.Add(instance))
            {
                errors.Add(new ConfigurationError(asset, prefix.TrimEnd('.'),
                    traversalMessage ?? "Nested configuration contains a reference cycle."));
                return;
            }
            try
            {
                foreach (var entry in GetMembers(instance.GetType()))
                {
                    var setting = prefix + entry.Setting;
                    object value;
                    if (entry.Member is FieldInfo field) value = field.GetValue(instance);
                    else
                    {
                        var property = (PropertyInfo)entry.Member;
                        if (property.GetIndexParameters().Length != 0 || property.GetGetMethod(true) == null)
                        {
                            errors.Add(new ConfigurationError(asset, setting, "Validation requires a readable, non-indexed property."));
                            continue;
                        }
                        try { value = property.GetValue(instance); }
                        catch (TargetInvocationException exception)
                        {
                            errors.Add(new ConfigurationError(asset, setting, $"Cannot read property: {exception.InnerException?.Message}"));
                            continue;
                        }
                    }
                    foreach (var rule in entry.Rules)
                    {
                        if (rule is Validation.IncreasingAttribute sequence)
                        {
                            CollectSequence(asset, value, setting, sequence, errors);
                            continue;
                        }
                        var memberType = entry.Member is FieldInfo memberField ? memberField.FieldType : ((PropertyInfo)entry.Member).PropertyType;
                        // Collection presence is independent of entry/reference validation.
                        if (value == null && typeof(ICollection).IsAssignableFrom(memberType) &&
                            (rule is Validation.NestedAttribute || rule is Validation.ValidReferenceAttribute)) continue;
                        if (rule is Validation.RequiredElementsAttribute && value is ICollection collection)
                        {
                            var index = 0;
                            foreach (var element in collection)
                            {
                                if (IsMissing(element)) errors.Add(new ConfigurationError(asset, $"{setting}[{index}]",
                                    rule.ResolveMessage("Entry must not be null.")));
                                index++;
                            }
                            continue;
                        }
                        if (rule is Validation.NestedAttribute || rule is Validation.ValidReferenceAttribute)
                        {
                            if (value is ICollection entries)
                            {
                                var index = 0;
                                foreach (var element in entries)
                                    CollectChild(asset, element, $"{setting}[{index++}]", rule, errors, visiting);
                            }
                            else CollectChild(asset, value, setting, rule, errors, visiting);
                            continue;
                        }
                        var error = rule.GetError(value, instance);
                        if (error != null) errors.Add(new ConfigurationError(asset, setting, rule.ResolveMessage(error)));
                    }
                }
                if (!ReferenceEquals(instance, asset) && instance is INestedConfigurationValidator nested)
                    nested.CollectConfigurationErrors((setting, message) => errors.Add(new ConfigurationError(asset,
                        string.IsNullOrEmpty(setting) ? prefix.TrimEnd('.') : prefix + setting, message)));
            }
            finally { visiting.Remove(instance); }
        }

        private static bool IsMissing(object value) => value == null || (value is UnityEngine.Object obj && !obj);

        internal static bool TryReadMember(object instance, string name, out object value, out string error)
        {
            value = null;
            error = null;
            if (string.IsNullOrEmpty(name)) { error = "Specify a member name."; return false; }
            var member = NamedMembers.GetOrAdd((instance.GetType(), name), key =>
            {
                const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly;
                for (var type = key.Item1; type != null; type = type.BaseType)
                {
                    var field = type.GetField(key.Item2, flags);
                    if (field != null) return new NamedMember { Member = field };
                    var property = type.GetProperties(flags).FirstOrDefault(p => p.Name == key.Item2 && p.GetIndexParameters().Length == 0);
                    if (property != null) return new NamedMember { Member = property };
                }
                return new NamedMember();
            }).Member;
            if (member is FieldInfo info) { value = info.GetValue(instance); return true; }
            if (member is PropertyInfo prop && prop.GetIndexParameters().Length == 0 && prop.GetGetMethod(true) != null)
            {
                try { value = prop.GetValue(instance); return true; }
                catch (TargetInvocationException exception) { error = $"Cannot read '{name}': {exception.InnerException?.Message}"; return false; }
            }
            error = $"No readable instance member named '{name}' on {instance.GetType().Name}.";
            return false;
        }

        private static void CollectSequence(ValidatedScriptableObject asset, object value, string setting,
            Validation.IncreasingAttribute rule, List<ConfigurationError> errors)
        {
            if (value == null) return; // Collection presence and entries have their own rules.
            if (value is not ICollection collection)
            {
                errors.Add(new ConfigurationError(asset, setting, rule.ResolveMessage("Increasing requires an ICollection.")));
                return;
            }
            if (rule.HasFirst && (double.IsNaN(rule.First) || double.IsInfinity(rule.First)))
            {
                errors.Add(new ConfigurationError(asset, setting, rule.ResolveMessage("First must be finite.")));
                return;
            }
            var index = 0;
            var hasPrevious = false;
            double previous = 0;
            foreach (var element in collection)
            {
                var path = $"{setting}[{index}].{rule.Member}";
                if (IsMissing(element)) hasPrevious = false;
                else if (!TryReadMember(element, rule.Member, out var memberValue, out var error))
                {
                    errors.Add(new ConfigurationError(asset, path, rule.ResolveMessage(error)));
                    hasPrevious = false;
                }
                else if (!rule.TryValue(memberValue, out var number) || double.IsNaN(number) || double.IsInfinity(number))
                {
                    errors.Add(new ConfigurationError(asset, path, rule.ResolveMessage("Sequence values must be finite numbers.")));
                    hasPrevious = false;
                }
                else
                {
                    if (index == 0 && rule.HasFirst && number != rule.First)
                        errors.Add(new ConfigurationError(asset, path, rule.ResolveMessage(
                            $"First value must be {rule.First.ToString(System.Globalization.CultureInfo.InvariantCulture)}.")));
                    if (hasPrevious && number <= previous)
                        errors.Add(new ConfigurationError(asset, path, rule.ResolveMessage("Values must be strictly increasing.")));
                    previous = number;
                    hasPrevious = true;
                }
                index++;
            }
        }

        private static void CollectChild(ValidatedScriptableObject asset, object value, string setting,
            Validation.RuleAttribute rule, List<ConfigurationError> errors, HashSet<object> visiting)
        {
            if (rule is Validation.ValidReferenceAttribute)
            {
                if (IsMissing(value))
                    errors.Add(new ConfigurationError(asset, setting, rule.ResolveMessage("Assign a reference.")));
                else if (value is ValidatedScriptableObject reference)
                    foreach (var error in reference.ValidateConfiguration())
                        errors.Add(new ConfigurationError(asset, setting + "." + error.Setting,
                            rule.ResolveMessage($"Referenced asset '{reference.name}': {error.Message}")));
                else errors.Add(new ConfigurationError(asset, setting,
                    rule.ResolveMessage("ValidReference requires a validated ScriptableObject.")));
                return;
            }
            // Nested is traversal only. Pair it with Required/RequiredElements when null is invalid.
            if (IsMissing(value)) return;
            if (value is UnityEngine.Object || value is string || value.GetType().IsPrimitive || value is Enum || value is decimal)
                errors.Add(new ConfigurationError(asset, setting,
                    rule.ResolveMessage("Nested requires a plain configuration object; use ValidReference for assets.")));
            else CollectMembers(asset, value, setting + ".", errors, visiting, rule.Message);
        }

        private static MemberRules[] GetMembers(Type type)
        {
            return Cache.GetOrAdd(type, BuildMembers);
        }

        private static MemberRules[] BuildMembers(Type type)
        {
            var members = new List<MemberRules>();
            var properties = new HashSet<string>();
            for (var current = type; current != null && current != typeof(ScriptableObject); current = current.BaseType)
            {
                const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly;
                foreach (var member in current.GetFields(flags).Cast<MemberInfo>().Concat(current.GetProperties(flags)))
                {
                    // A derived property supplies the rules for an overridden/hidden property.
                    if (member is PropertyInfo && !properties.Add(member.Name)) continue;
                    var rules = Attribute.GetCustomAttributes(member, typeof(Validation.RuleAttribute), true)
                        .Cast<Validation.RuleAttribute>().ToArray();
                    if (rules.Length == 0) continue;
                    var setting = member.Name;
                    if (setting.StartsWith("<", StringComparison.Ordinal) && setting.EndsWith(">k__BackingField", StringComparison.Ordinal))
                        setting = setting.Substring(1, setting.IndexOf('>') - 1);
                    members.Add(new MemberRules { Member = member, Setting = setting, Rules = rules });
                }
            }
            return members.ToArray();
        }
    }
}

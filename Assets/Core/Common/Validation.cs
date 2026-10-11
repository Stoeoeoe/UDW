using System;
using System.Collections;
using System.Globalization;
using UnityEngine;

namespace Core.Common
{
    /// <summary>Declarative, read-only configuration rules. Messages can be supplied in the constructor or by name.</summary>
    public static class Validation
    {
        [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = true, Inherited = true)]
        public abstract class RuleAttribute : Attribute
        {
            public string Message { get; set; }
            protected RuleAttribute(string message) => Message = message;
            internal virtual string GetError(object value) => null;
            internal virtual string GetError(object value, object owner) => GetError(value);
            internal string ResolveMessage(string error) => Message ?? error;

            protected static bool TryNumber(object value, out double number)
            {
                if (value is sbyte or byte or short or ushort or int or uint or long or ulong or float or double or decimal)
                {
                    number = Convert.ToDouble(value, CultureInfo.InvariantCulture);
                    return true;
                }
                number = default;
                return false;
            }
        }

        public sealed class RequiredAttribute : RuleAttribute
        {
            public RequiredAttribute(string message = null) : base(message) { }
            internal override string GetError(object value) =>
                value == null || (value is UnityEngine.Object obj && !obj) ? "Assign a value." : null;
        }

        public sealed class NotEmptyAttribute : RuleAttribute
        {
            public NotEmptyAttribute(string message = null) : base(message) { }
            internal override string GetError(object value) => value switch
            {
                null => "Must not be null or empty.",
                string text => string.IsNullOrWhiteSpace(text) ? "Must not be blank." : null,
                ICollection collection => collection.Count == 0 ? "Must contain at least one entry." : null,
                _ => "NotEmpty requires a string or an ICollection."
            };
        }

        public sealed class IdAttribute : RuleAttribute
        {
            public IdAttribute(string message = null) : base(message) { }
            internal override string GetError(object value) =>
                value is string text && DefinitionIdRules.IsPresent(text) ? null : "Assign a stable, nonblank ID.";
        }

        public sealed class NamespacedIdAttribute : RuleAttribute
        {
            public bool Lowercase { get; set; }
            public NamespacedIdAttribute(string message = null) : base(message) { }
            internal override string GetError(object value) =>
                value is string text && (Lowercase ? DefinitionIdRules.IsLowercaseNamespaced(text) : DefinitionIdRules.IsNamespaced(text))
                    ? null : Lowercase ? "Assign a lowercase namespace:name ID." : "Assign a namespace:name ID without whitespace.";
        }

        public sealed class MinAttribute : RuleAttribute
        {
            public double Minimum { get; }
            public MinAttribute(double minimum, string message = null) : base(message) => Minimum = minimum;
            internal override string GetError(object value)
            {
                if (!TryNumber(value, out var number)) return "Min requires a numeric value.";
                if (double.IsNaN(Minimum) || double.IsInfinity(Minimum)) return "Min requires a finite minimum.";
                return number >= Minimum ? null : $"Must be at least {Minimum.ToString(CultureInfo.InvariantCulture)}.";
            }
        }

        public sealed class RangeAttribute : RuleAttribute
        {
            public double Minimum { get; }
            public double Maximum { get; }
            public RangeAttribute(double minimum, double maximum, string message = null) : base(message)
            {
                Minimum = minimum;
                Maximum = maximum;
            }
            internal override string GetError(object value)
            {
                if (!TryNumber(value, out var number)) return "Range requires a numeric value.";
                if (double.IsNaN(Minimum) || double.IsInfinity(Minimum) || double.IsNaN(Maximum) || double.IsInfinity(Maximum) || Minimum > Maximum)
                    return "Range requires ordered, finite bounds.";
                return number >= Minimum && number <= Maximum ? null :
                    $"Must be between {Minimum.ToString(CultureInfo.InvariantCulture)} and {Maximum.ToString(CultureInfo.InvariantCulture)} (inclusive).";
            }
        }

        public sealed class FiniteAttribute : RuleAttribute
        {
            public FiniteAttribute(string message = null) : base(message) { }
            internal override string GetError(object value)
            {
                if (!TryNumber(value, out var number)) return "Finite requires a numeric value.";
                return double.IsNaN(number) || double.IsInfinity(number) ? "Must be finite." : null;
            }
        }

        public sealed class DefinedEnumAttribute : RuleAttribute
        {
            public DefinedEnumAttribute(string message = null) : base(message) { }
            internal override string GetError(object value) =>
                value is Enum && Enum.IsDefined(value.GetType(), value) ? null : "Select a defined enum value.";
        }

        /// <summary>Requires every collection entry; null/empty collections themselves are allowed.</summary>
        public sealed class RequiredElementsAttribute : RuleAttribute
        {
            public RequiredElementsAttribute(string message = null) : base(message) { }
            internal override string GetError(object value) =>
                value == null || value is ICollection ? null : "RequiredElements requires an ICollection.";
        }

        /// <summary>Opt in to annotated fields on a plain object or each collection entry.</summary>
        public sealed class NestedAttribute : RuleAttribute
        {
            public NestedAttribute(string message = null) : base(message) { }
            internal override string GetError(object value) => null;
        }

        /// <summary>Validates a referenced asset, or each asset in a collection. Also requires references.</summary>
        public sealed class ValidReferenceAttribute : RuleAttribute
        {
            public ValidReferenceAttribute(string message = null) : base(message) { }
            internal override string GetError(object value) => null;
        }

        public sealed class AtLeastAttribute : RuleAttribute
        {
            public string Member { get; }
            public AtLeastAttribute(string member, string message = null) : base(message) => Member = member;
            internal override string GetError(object value, object owner)
            {
                if (!AttributeConfigurationValidation.TryReadMember(owner, Member, out var other, out var error)) return error;
                if (!TryNumber(value, out var number) || !TryNumber(other, out var minimum))
                    return "AtLeast requires two numeric members.";
                return number >= minimum ? null : $"Must be at least {Member}.";
            }
        }

        /// <summary>Checks one explicitly named member without validating the complete referenced object.</summary>
        public sealed class MemberNotEmptyAttribute : RuleAttribute
        {
            public string Member { get; }
            public MemberNotEmptyAttribute(string member, string message = null) : base(message) => Member = member;
            internal override string GetError(object value)
            {
                // Reference presence is a separate Required rule.
                if (value == null || (value is UnityEngine.Object obj && !obj)) return null;
                if (!AttributeConfigurationValidation.TryReadMember(value, Member, out var memberValue, out var error)) return error;
                var memberError = new NotEmptyAttribute().GetError(memberValue);
                return memberError == null ? null : $"Referenced member '{Member}': {memberError}";
            }
        }

        /// <summary>Strictly increasing numeric values in a collection, with an optional exact first value.</summary>
        public sealed class IncreasingAttribute : RuleAttribute
        {
            private double _first;
            public string Member { get; }
            public double First { get => _first; set { _first = value; HasFirst = true; } }
            internal bool HasFirst { get; private set; }
            public IncreasingAttribute(string member, string message = null) : base(message) => Member = member;
            internal bool TryValue(object value, out double number) => TryNumber(value, out number);
        }
    }
}

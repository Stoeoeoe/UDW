using System;
using UnityEngine;

namespace Core.Common
{
    /// <summary>Edits one serialized string as an editable namespace, a fixed colon, and a local ID.</summary>
    [AttributeUsage(AttributeTargets.Field)]
    public sealed class NamespacedIdAttribute : PropertyAttribute
    {
        public const string DefaultNamespace = "base";
        public string[] SuggestedNamespaces { get; }

        public NamespacedIdAttribute(params string[] suggestedNamespaces) =>
            SuggestedNamespaces = suggestedNamespaces;
    }
}

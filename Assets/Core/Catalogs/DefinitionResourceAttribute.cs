using System;
using UnityEngine.Scripting;

namespace Core.Catalogs
{
    public enum DefinitionIdFormat { Any, Namespaced, LowercaseNamespaced }

    /// <summary>Declares a definition family and its discovery folder. Derived definitions share its ID space.</summary>
    [AttributeUsage(AttributeTargets.Class, Inherited = false)]
    public sealed class DefinitionResourceAttribute : PreserveAttribute
    {
        public string Path { get; }
        public DefinitionIdFormat IdFormat { get; set; } = DefinitionIdFormat.LowercaseNamespaced;
        public DefinitionResourceAttribute(string path = "Assets") => Path = path;
    }

    public interface IDefinition
    {
        string Id { get; }
    }
}

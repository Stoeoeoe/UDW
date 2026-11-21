using System;

namespace Core.Catalogs.Editor
{
    /// <summary>Runs a feature's static collection validator during catalog discovery, before Play Mode and builds.</summary>
    [AttributeUsage(AttributeTargets.Method)]
    internal sealed class DefinitionValidationAttribute : Attribute
    {
        public Type Type { get; }
        public DefinitionValidationAttribute(Type type) => Type = type;
    }
}

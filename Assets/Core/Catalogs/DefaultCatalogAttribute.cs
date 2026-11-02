using System;

namespace Core.Catalogs
{
    /// <summary>Declares the default Resources asset created by editor setup.</summary>
    [AttributeUsage(AttributeTargets.Class, Inherited = false)]
    public sealed class DefaultCatalogAttribute : Attribute
    {
        public string ResourceName { get; }
        public DefaultCatalogAttribute(string resourceName) => ResourceName = resourceName;
    }
}

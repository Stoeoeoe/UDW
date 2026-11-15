using System;

namespace Core.Common
{
    /// <summary>
    /// Marks a definition, or a plain class inside one, whose values come from an import (such as Vulcanus JSON):
    /// the inspector shows its members read-only, so edits are made in the source and reimported.
    /// </summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Struct)]
    public sealed class ImportedDataAttribute : Attribute { }
}

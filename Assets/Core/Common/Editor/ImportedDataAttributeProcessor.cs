using System;
using System.Collections.Generic;
using System.Reflection;
using Sirenix.OdinInspector;
using Sirenix.OdinInspector.Editor;

namespace Core.Common.Editor
{
    /// <summary>Makes every serialized member of an <see cref="ImportedDataAttribute"/> type read-only in the inspector.</summary>
    public sealed class ImportedDataAttributeProcessor : OdinAttributeProcessor<object>
    {
        public override bool CanProcessChildMemberAttributes(InspectorProperty parentProperty, MemberInfo member) =>
            member.DeclaringType.IsDefined(typeof(ImportedDataAttribute), false);

        public override void ProcessChildMemberAttributes(InspectorProperty parentProperty, MemberInfo member, List<Attribute> attributes) =>
            attributes.Add(new ReadOnlyAttribute());
    }
}

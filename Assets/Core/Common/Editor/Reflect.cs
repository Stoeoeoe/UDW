using System;
using System.Reflection;
using System.Runtime.ExceptionServices;

namespace Core.Common.Editor
{
    /// <summary>
    /// Private-field access for tests configuring serialized authoring data. Import with
    /// <c>using static Core.Common.Editor.Reflect;</c> and call <c>Set(target, "field", value)</c>.
    /// Fields are found on the target's type or any base type; a missing field fails loudly.
    /// </summary>
    internal static class Reflect
    {
        private const BindingFlags Fields = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly;

        public static void Set(object target, string field, object value) => Field(target.GetType(), field).SetValue(target, value);
        /// <summary>Sets a field declared by <paramref name="owner"/> when a derived type hides or repeats the name.</summary>
        public static void Set(object target, string field, object value, Type owner) => Field(owner, field).SetValue(target, value);
        public static void Set(Type owner, object target, string field, object value) => Field(owner, field).SetValue(target, value);
        public static T Get<T>(object target, string field) => (T)Field(target.GetType(), field).GetValue(target);
        public static object Get(object target, string field) => Field(target.GetType(), field).GetValue(target);

        /// <summary>Calls a non-public instance method, rethrowing its exception unwrapped.</summary>
        public static object Call(object target, string method, params object[] arguments)
        {
            for (var type = target.GetType(); type != null; type = type.BaseType)
            {
                var found = type.GetMethod(method, Fields | BindingFlags.Static);
                if (found == null) continue;
                try { return found.Invoke(target, arguments); }
                catch (TargetInvocationException error) { ExceptionDispatchInfo.Capture(error.InnerException).Throw(); }
            }
            throw new MissingMethodException(target.GetType().Name, method);
        }

        private static FieldInfo Field(Type type, string name)
        {
            for (var current = type; current != null; current = current.BaseType)
            {
                // An auto-property is set by its property name: its serialized field is the compiler's backing field.
                var field = current.GetField(name, Fields) ?? current.GetField($"<{name}>k__BackingField", Fields);
                if (field != null) return field;
            }
            throw new MissingFieldException(type.Name, name);
        }
    }
}

using System;

namespace Core.Common
{
    /// <summary>Small shared predicates for definition IDs; each definition chooses its own policy.</summary>
    public static class DefinitionIdRules
    {
        public static bool IsPresent(string id) => !string.IsNullOrWhiteSpace(id);

        public static bool IsNamespaced(string id)
        {
            if (!IsPresent(id)) return false;
            var separator = id.IndexOf(':');
            return separator > 0 && separator < id.Length - 1 && !ContainsWhitespace(id);
        }

        public static bool IsLowercaseNamespaced(string id)
        {
            if (!IsNamespaced(id)) return false;
            foreach (var character in id)
                if (!(character is >= 'a' and <= 'z' or >= '0' and <= '9' or '_' or '-' or ':')) return false;
            var separator = id.IndexOf(':');
            return id.IndexOf(':', separator + 1) < 0;
        }

        private static bool ContainsWhitespace(string value)
        {
            foreach (var character in value)
                if (char.IsWhiteSpace(character)) return true;
            return false;
        }
    }
}

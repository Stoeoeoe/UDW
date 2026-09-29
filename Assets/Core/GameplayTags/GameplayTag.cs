using System;

namespace Core.GameplayTags
{
    /// <summary>Authoring-time validation for dotted gameplay tags.</summary>
    public static class GameplayTag
    {
        public static void Validate(string tag)
        {
            if (string.IsNullOrWhiteSpace(tag))
                throw new ArgumentException("A gameplay tag is required.", nameof(tag));

            if (tag[0] == '.' || tag[tag.Length - 1] == '.' || tag.Contains(".."))
                throw new ArgumentException($"Gameplay tag '{tag}' has an empty path segment.", nameof(tag));

            var root = tag.Split('.')[0];
            if (root is "exact" or "all" or "any" or "none")
                throw new ArgumentException($"Gameplay tag root '{root}' is reserved for queries.", nameof(tag));

            foreach (var character in tag)
                if (!char.IsLetterOrDigit(character) && character != '_' && character != '-' && character != '.')
                    throw new ArgumentException($"Gameplay tag '{tag}' contains an invalid character.", nameof(tag));
        }

    }
}

using System;
using System.Collections.Generic;
using Core.GameplayTags;

namespace Core.Scripting
{
    /// <summary>Read-only Lua access to the current player character's runtime tags.</summary>
    [LuaModule("Player.Tags")]
    internal sealed class CharacterTagLuaApi
    {
        private readonly Func<TagSet> _tags;
        private readonly Dictionary<string, TagQuery> _queries = new(StringComparer.Ordinal);

        public CharacterTagLuaApi(Func<TagSet> tags) => _tags = tags ?? throw new ArgumentNullException(nameof(tags));

        [LuaCall]
        public bool Has(string tag) => CurrentTags().Has(tag);

        [LuaCall]
        public bool HasExact(string tag) => CurrentTags().Has(tag, exact: true);

        [LuaCall]
        public bool Matches(string expression)
        {
            if (!_queries.TryGetValue(expression, out var query))
            {
                query = TagQuery.Parse(expression);
                _queries.Add(expression, query);
            }

            return query.Matches(CurrentTags());
        }

        private TagSet CurrentTags() => _tags() ??
            throw new InvalidOperationException("The player character is not available for Lua tag queries.");
    }
}

using System;
using System.Collections.Generic;
using System.Linq;

namespace Core.GameplayTags
{
    /// <summary>Runtime-only tags granted by replaceable sources such as skills and boons.</summary>
    public sealed class TagSet
    {
        private readonly Dictionary<string, string[]> _sources = new();
        private readonly HashSet<string> _exact = new();
        private readonly HashSet<string> _withParents = new();
        private bool _dirty;

        public bool Has(string tag, bool exact = false)
        {
            if (_dirty) Rebuild();
            return (exact ? _exact : _withParents).Contains(tag);
        }

        /// <summary>Replaces all tags granted by the source. An empty list removes it.</summary>
        public void SetSourceTags(string sourceId, IEnumerable<string> tags)
        {
            var copy = tags.ToArray();
            foreach (var tag in copy) GameplayTag.Validate(tag);

            if (copy.Length == 0) _sources.Remove(sourceId);
            else _sources[sourceId] = copy;
            _dirty = true;
        }

        public void RemoveSource(string sourceId) => _dirty |= _sources.Remove(sourceId);

        public void RemoveSourcesWithPrefix(string prefix)
        {
            foreach (var key in _sources.Keys.Where(k => k.StartsWith(prefix, StringComparison.Ordinal)).ToList())
                RemoveSource(key);
        }

        private void Rebuild()
        {
            _exact.Clear();
            _withParents.Clear();
            foreach (var tag in _sources.Values.SelectMany(t => t))
            {
                _exact.Add(tag);
                _withParents.Add(tag);
                for (var dot = tag.IndexOf('.'); dot >= 0; dot = tag.IndexOf('.', dot + 1))
                    _withParents.Add(tag.Substring(0, dot));
            }

            _dirty = false;
        }
    }
}
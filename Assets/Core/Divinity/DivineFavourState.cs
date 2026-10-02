using System;
using System.Collections.Generic;

namespace Core.Divinity
{
    /// <summary>Saved favour scores only. Active boons and attribute modifiers are derived at runtime.</summary>
    public sealed class DivineFavourState
    {
        private readonly Dictionary<string, int> _scores = new(StringComparer.Ordinal);

        public int GetFavour(string deityId) => _scores.TryGetValue(deityId, out var score) ? score : 0;

        internal void SetFavour(string deityId, int score)
        {
            if (score == 0) _scores.Remove(deityId);
            else _scores[deityId] = score;
        }

        internal Dictionary<string, int> Capture() => new(_scores, StringComparer.Ordinal);

        internal IEnumerable<KeyValuePair<string, int>> GetScores() => _scores;

        internal void Restore(IReadOnlyDictionary<string, int> scores)
        {
            _scores.Clear();
            foreach (var pair in scores)
                SetFavour(pair.Key, pair.Value);
        }
    }
}

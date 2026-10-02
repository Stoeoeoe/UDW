using System;
using System.Collections.Generic;
using Character;
using Core.Events;
using Core.TimeAndWeather;

namespace Core.Divinity
{
    /// <summary>Changes saved scores and projects threshold boons onto the current player character.</summary>
    public sealed class DivineFavourManager : IDisposable, IEventListener<NewDayEvent>
    {
        private readonly DivineFavourState _state;
        private readonly Dictionary<string, BoonDefinition> _activeBoons = new(StringComparer.Ordinal);
        private GameCharacter _character;

        public DivineFavourManager(DivineFavourState state)
        {
            _state = state ?? throw new ArgumentNullException(nameof(state));
            EventBus<NewDayEvent>.Subscribe(this);
        }

        public int GetFavour(string deityId) => _state.GetFavour(deityId);

        /// <summary>Accepts positive or negative changes. Returns the resulting score.</summary>
        public int AddFavour(string deityId, int points)
        {
            DeityDefinitions.Get(deityId);
            var previous = GetFavour(deityId);
            var current = (int)Math.Max(int.MinValue, Math.Min(int.MaxValue, (long)previous + points));
            if (previous == current) return current;
            _state.SetFavour(deityId, current);
            RefreshBoons();
            // Notifications describe a completed change: observers see current attributes.
            DivineFavourChangedEvent.Trigger(_state, deityId, previous, current);
            return current;
        }

        public int AddFavour(DeityDefinition deity, int points)
        {
            if (!deity) throw new ArgumentNullException(nameof(deity));
            return AddFavour(deity.Id, points);
        }

        public void BindCharacter(GameCharacter character)
        {
            if (_character == character)
            {
                RefreshBoons();
                return;
            }
            ClearBoons();
            _character = character;
            RefreshBoons();
        }

        public void OnEvent(NewDayEvent change) => AdvanceDays(1);

        public void AdvanceDays(int days)
        {
            if (days < 0) throw new ArgumentOutOfRangeException(nameof(days));
            if (days == 0) return;
            var previous = _state.Capture();
            var changed = new List<string>();
            foreach (var pair in previous)
            {
                if (!DeityDefinitions.TryGet(pair.Key, out var deity)) continue;
                var decay = (long)deity.DailyDecay * days;
                var score = pair.Value > 0
                    ? (int)Math.Max(0, pair.Value - decay)
                    : (int)Math.Min(0, pair.Value + decay);
                if (score == pair.Value) continue;
                _state.SetFavour(pair.Key, score);
                changed.Add(pair.Key);
            }
            RefreshBoons();
            foreach (var id in changed)
                DivineFavourChangedEvent.Trigger(_state, id, previous[id], _state.GetFavour(id));
        }

        /// <summary>Restores a save without advancing time or publishing gameplay-change events.</summary>
        public void Restore(IReadOnlyDictionary<string, int> scores)
        {
            if (scores == null) throw new ArgumentNullException(nameof(scores));
            _state.Restore(scores);
            RefreshBoons();
        }

        public void Dispose()
        {
            EventBus<NewDayEvent>.Unsubscribe(this);
            ClearBoons();
            _character = null;
        }

        private void RefreshBoons()
        {
            if (!_character) return;
            var desired = new Dictionary<string, BoonDefinition>(StringComparer.Ordinal);
            foreach (var pair in _state.GetScores())
            {
                // Keep unknown mod IDs in saves even when their definitions are unavailable.
                if (!DeityDefinitions.TryGet(pair.Key, out var deity)) continue;
                for (var levelIndex = 0; levelIndex < deity.Levels.Count; levelIndex++)
                {
                    var level = deity.Levels[levelIndex];
                    if (level == null || pair.Value < level.RequiredPoints) continue;
                    for (var boonIndex = 0; boonIndex < level.Boons.Count; boonIndex++)
                    {
                        var boon = level.Boons[boonIndex];
                        if (!boon) continue;
                        var source = $"divine-favour:{pair.Key}:{levelIndex}:{boonIndex}";
                        desired.Add(source, boon);
                    }
                }
            }

            // Leave unchanged grants in place. Removing/reapplying stamina bonuses could
            // temporarily lower the maximum and clamp the player's current stamina.
            foreach (var grant in _activeBoons)
                if (!desired.TryGetValue(grant.Key, out var definition) || definition != grant.Value)
                    grant.Value.Remove(_character, grant.Key);
            foreach (var grant in desired)
                if (!_activeBoons.TryGetValue(grant.Key, out var definition) || definition != grant.Value)
                    grant.Value.Apply(_character, grant.Key);
            _activeBoons.Clear();
            foreach (var grant in desired) _activeBoons.Add(grant.Key, grant.Value);
        }

        private void ClearBoons()
        {
            if (_character)
                foreach (var grant in _activeBoons)
                    grant.Value.Remove(_character, grant.Key);
            _activeBoons.Clear();
        }

    }
}

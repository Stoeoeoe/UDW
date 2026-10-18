using System;
using System.Collections.Generic;
using System.Linq;
using Core.Events;
using Core.Game;
using Core.TimeAndWeather;
using UnityEngine;

namespace Character
{
    /// <summary>Applies temporary attribute boosts, refreshes their durations and expires them with the game clock.</summary>
    [DisallowMultipleComponent]
    public sealed class CharacterBoosts : MonoBehaviour, IEventListener<GameTimeChangedEvent>
    {
        private CharacterAttributes _attributes;
        private CharacterBoostState _state;
        private readonly Dictionary<string, ActiveAttributeBoost> _applied = new(StringComparer.Ordinal);

        internal void Bind(GameCharacter character) => _attributes = character.Attributes;

        /// <summary>Restores still-active modifiers before health and stamina initialize. Expired records are removed.</summary>
        public void Initialize(CharacterBoostState state)
        {
            Unbind();
            _state = state;
            var now = GameState.Time.TotalMinutes;
            foreach (var entry in state.Active.ToArray())
            {
                if (entry.Value.ExpiresAtMinute <= now) { state.Active.Remove(entry.Key); continue; }
                _applied.Add(entry.Key, entry.Value);
                entry.Value.Apply(_attributes, entry.Key);
            }
            this.Subscribe<GameTimeChangedEvent>();
        }

        /// <summary>Whether this boost currently has an active modifier source.</summary>
        public bool IsActive(string source) => _state.Active.ContainsKey(source);

        /// <summary>Captures validated authored bonuses. An active source refreshes its duration without stacking or replacing its values.</summary>
        public void Apply(string source, int durationMinutes, IReadOnlyList<AttributeBonus> bonuses)
        {
            var now = GameState.Time.TotalMinutes;
            Expire(now);
            if (_state.Active.TryGetValue(source, out var active))
            {
                active.ExpiresAtMinute = now + durationMinutes;
                return;
            }
            active = new ActiveAttributeBoost
            {
                ExpiresAtMinute = now + durationMinutes,
                Bonuses = bonuses.Select(bonus => new AppliedAttributeBonus
                {
                    Attribute = bonus.Attribute, Flat = bonus.Flat, Percent = bonus.Percent
                }).ToArray()
            };
            _state.Active.Add(source, active);
            _applied.Add(source, active);
            active.Apply(_attributes, source);
        }

        public void OnEvent(GameTimeChangedEvent change) => Expire(change.TotalMinutes);

        private void Expire(long now)
        {
            var expired = _state.Active.Where(entry => entry.Value.ExpiresAtMinute <= now).Select(entry => entry.Key).ToArray();
            foreach (var id in expired)
            {
                var boost = _applied[id];
                _state.Active.Remove(id);
                _applied.Remove(id);
                boost.Remove(_attributes, id);
            }
        }

        internal void Unbind()
        {
            this.Unsubscribe<GameTimeChangedEvent>();
            var applied = _applied.ToArray();
            _applied.Clear();
            foreach (var entry in applied) entry.Value.Remove(_attributes, entry.Key);
        }

        // GameCharacter removes modifiers after detaching resource listeners; release the static subscription in either destruction order.
        private void OnDestroy() => this.Unsubscribe<GameTimeChangedEvent>();
    }
}

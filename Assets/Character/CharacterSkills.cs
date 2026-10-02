using System;
using System.Collections.Generic;

namespace Character
{
    /// <summary>Current skill levels for one character.</summary>
    public sealed class CharacterSkills
    {
        private readonly Dictionary<string, int> _levels = new Dictionary<string, int>(StringComparer.Ordinal);
        // Only levels belong in saved state; grants are applied to the bound character.
        [NonSerialized] private GameCharacter _character;

        public int GetLevel(string skillId) => _levels.TryGetValue(skillId, out var level) ? level : 0;

        public int GetLevel(SkillDefinition skill) => GetLevel(skill.SkillId);

        public bool HasUnlocked(string skillId) => GetLevel(skillId) > 0;

        public bool HasUnlocked(SkillDefinition skill) => GetLevel(skill) > 0;

        public bool TryLevelUp(SkillDefinition skill) => TryLevelUp(skill.SkillId);

        public bool TryLevelUp(string skillId)
        {
            var definition = SkillDefinitions.Get(skillId);
            var currentLevel = GetLevel(skillId);
            if (currentLevel >= definition.MaxLevel) return false;

            var newLevel = currentLevel + 1;
            _levels[skillId] = newLevel;
            ApplyLevel(skillId, newLevel);
            SkillLevelChangedEvent.Trigger(this, skillId, newLevel);
            return true;
        }

        internal IEnumerable<KeyValuePair<string, int>> GetLevels() => _levels;

        internal void BindCharacter(GameCharacter character)
        {
            if (!character) throw new ArgumentNullException(nameof(character));
            if (ReferenceEquals(_character, character)) return;
            if (_character) UnbindCharacter(_character);
            _character = character;
            foreach (var pair in _levels)
                for (var level = 1; level <= pair.Value; level++)
                    ApplyLevel(pair.Key, level);
        }

        internal void UnbindCharacter(GameCharacter character)
        {
            if (!ReferenceEquals(_character, character)) return;
            if (_character)
                foreach (var pair in _levels)
                    for (var level = 1; level <= pair.Value; level++)
                        RemoveLevel(pair.Key, level);
            _character = null;
        }

        private void ApplyLevel(string skillId, int level)
        {
            if (_character)
                SkillDefinitions.Get(skillId).GetLevelDefinition(level)?.Grant.Apply(_character, Source(skillId, level));
        }

        private void RemoveLevel(string skillId, int level)
        {
            if (_character)
                SkillDefinitions.Get(skillId).GetLevelDefinition(level)?.Grant.Remove(_character, Source(skillId, level));
        }

        private static string Source(string skillId, int level) => $"skill:{skillId}:{level}";

        internal void RestoreLevels(IEnumerable<KeyValuePair<string, int>> levels)
        {
            var previousLevels = new Dictionary<string, int>(_levels, StringComparer.Ordinal);
            _levels.Clear();
            foreach (var pair in levels)
                _levels.Add(pair.Key, pair.Value);

            var changes = new List<KeyValuePair<string, int>>();
            foreach (var pair in previousLevels)
                if (GetLevel(pair.Key) != pair.Value)
                    changes.Add(new KeyValuePair<string, int>(pair.Key, GetLevel(pair.Key)));

            foreach (var pair in _levels)
                if (!previousLevels.ContainsKey(pair.Key))
                    changes.Add(pair);

            // Update grants before any listener observes the restored skill state.
            foreach (var pair in changes)
            {
                var oldLevel = previousLevels.TryGetValue(pair.Key, out var old) ? old : 0;
                for (var level = oldLevel; level > pair.Value; level--)
                    RemoveLevel(pair.Key, level);
                for (var level = oldLevel + 1; level <= pair.Value; level++)
                    ApplyLevel(pair.Key, level);
            }

            foreach (var pair in changes)
                SkillLevelChangedEvent.Trigger(this, pair.Key, pair.Value);
        }
    }
}

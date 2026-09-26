using System;
using System.Collections.Generic;

namespace Character
{
    /// <summary>Current skill levels for one character.</summary>
    public sealed class CharacterSkills
    {
        private readonly Dictionary<string, int> _levels = new Dictionary<string, int>(StringComparer.Ordinal);

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
            SkillLevelChangedEvent.Trigger(this, skillId, newLevel);
            return true;
        }

        internal IEnumerable<KeyValuePair<string, int>> GetLevels() => _levels;

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

            foreach (var pair in changes)
                SkillLevelChangedEvent.Trigger(this, pair.Key, pair.Value);
        }
    }
}

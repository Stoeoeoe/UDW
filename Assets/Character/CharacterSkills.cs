using System;
using System.Collections.Generic;
using Core.GameplayTags;

namespace Character
{
    /// <summary>Current skill levels for one character.</summary>
    public sealed class CharacterSkills
    {
        private readonly Dictionary<string, int> _levels = new Dictionary<string, int>(StringComparer.Ordinal);
        // Scene-bound projection target; only levels belong in saved state.
        [NonSerialized] private TagSet _tags;

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
            UpdateSkillTags(skillId, newLevel);
            SkillLevelChangedEvent.Trigger(this, skillId, newLevel);
            return true;
        }

        internal IEnumerable<KeyValuePair<string, int>> GetLevels() => _levels;

        internal void BindTags(TagSet tags)
        {
            if (tags == null) throw new ArgumentNullException(nameof(tags));
            if (_tags != null && !ReferenceEquals(_tags, tags))
                _tags.RemoveSourcesWithPrefix("skill:");

            _tags = tags;
            _tags.RemoveSourcesWithPrefix("skill:");
            foreach (var pair in _levels)
                UpdateSkillTags(pair.Key, pair.Value);
        }

        internal void UnbindTags(TagSet tags)
        {
            if (!ReferenceEquals(_tags, tags)) return;
            _tags.RemoveSourcesWithPrefix("skill:");
            _tags = null;
        }

        private void UpdateSkillTags(string skillId, int level)
        {
            if (_tags == null) return;

            var source = "skill:" + skillId;
            if (level <= 0)
            {
                _tags.SetSourceTags(source, Array.Empty<string>());
                return;
            }

            var definition = SkillDefinitions.Get(skillId);
            var grantedTags = new List<string>();
            for (var currentLevel = 1; currentLevel <= level; currentLevel++)
            {
                var levelTags = definition.GetLevelDefinition(currentLevel)?.GrantedTags;
                if (levelTags != null) grantedTags.AddRange(levelTags);
            }

            _tags.SetSourceTags(source, grantedTags);
        }

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

            // Restore every derived tag before any listener observes the restored skill state.
            foreach (var pair in changes)
                UpdateSkillTags(pair.Key, pair.Value);

            foreach (var pair in changes)
                SkillLevelChangedEvent.Trigger(this, pair.Key, pair.Value);
        }
    }
}

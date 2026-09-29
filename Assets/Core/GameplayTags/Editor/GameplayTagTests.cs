using System;
using System.Collections.Generic;
using System.Reflection;
using Character;
using Core.Events;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Core.GameplayTags.Editor
{
    public sealed class GameplayTagTests
    {
        [Test]
        public void SourcesCanOverlapAndBeReplacedIndependently()
        {
            var tags = new TagSet();
            tags.SetSourceTags("skill:one", new[] { "State.Blessed" });
            tags.SetSourceTags("boon:mercury", new[] { "State.Blessed", "State.Inspired.Mercury" });

            tags.SetSourceTags("skill:one", Array.Empty<string>());
            Assert.That(tags.Has("State.Blessed"), Is.True);
            Assert.That(tags.Has("State.Inspired"), Is.True);
            Assert.That(tags.Has("State.Inspired", exact: true), Is.False);
            Assert.That(tags.Has("State", exact: false), Is.True);
            Assert.That(tags.Has("State", exact: true), Is.False);

            tags.RemoveSource("boon:mercury");
            Assert.That(tags.Has("State.Blessed"), Is.False);
        }

        [Test]
        public void RemovingSourcePrefixKeepsOtherSourcesAndSimilarPrefixes()
        {
            var tags = new TagSet();
            tags.SetSourceTags("skill:one", new[] { "State.Blessed" });
            tags.SetSourceTags("skill:two", new[] { "State.Inspired" });
            tags.SetSourceTags("skills:other", new[] { "State.Poisoned" });

            tags.RemoveSourcesWithPrefix("skill:");

            Assert.That(tags.Has("State.Blessed"), Is.False);
            Assert.That(tags.Has("State.Inspired"), Is.False);
            Assert.That(tags.Has("State.Poisoned"), Is.True);
            Assert.That(tags.Has("State"), Is.True);
        }

        [Test]
        public void QueryCombinesHierarchyExactAnyAllAndNone()
        {
            var tags = new TagSet();
            tags.SetSourceTags("boon", new[] { "State.Blessed.Mercury" });

            var query = TagQuery.Parse("all(State.Blessed, any(State.Blessed.Mercury, State.Inspired), none(State.Cursed), none(exact(State.Blessed)))");
            Assert.That(query.Matches(tags), Is.True);
            Assert.That(TagQuery.Parse("State.Bless").Matches(tags), Is.False);
            Assert.That(TagQuery.Parse("exact(State.Blessed)").Matches(tags), Is.False);
            Assert.That(TagQuery.All(TagQuery.Has("State"), TagQuery.None(TagQuery.Exact("State"))).Matches(tags), Is.True);
        }

        [Test]
        public void InvalidTagOrQueryIsRejected()
        {
            var tags = new TagSet();
            Assert.Throws<ArgumentException>(() => tags.SetSourceTags("source", new[] { "State..Blessed" }));
            Assert.Throws<ArgumentException>(() => tags.SetSourceTags("source", new[] { "base:State.Blessed" }));
            Assert.Throws<FormatException>(() => TagQuery.Parse("all(State.Blessed, )"));
            Assert.Throws<ArgumentException>(() => GameplayTag.Validate("all.State"));
            Assert.Throws<ArgumentException>(() => TagQuery.All());
        }

        [Test]
        public void CatalogRemovesOnlySelectedTags()
        {
            var catalog = ScriptableObject.CreateInstance<GameplayTagCatalog>();
            try
            {
                catalog.Add("Weapon.Spear");
                catalog.Add("Weapon.Spear.Long");
                catalog.Add("Weapon.Sword");
                catalog.Add("Weaponry.Staff");

                Assert.That(catalog.Contains("Weapon"), Is.False);
                Assert.That(catalog.Tags.Count, Is.EqualTo(4));
                catalog.Remove(new[] { "Weapon.Spear", "Weapon.Spear.Long", "Weapon.Sword" });
                Assert.That(catalog.Tags.Count, Is.EqualTo(1));
                Assert.That(catalog.Tags, Is.EquivalentTo(new[] { "Weaponry.Staff" }));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(catalog);
            }
        }

        [Test]
        public void SkillTagsAreCurrentDuringLevelChangeEvents()
        {
            var definition = ScriptableObject.CreateInstance<SkillDefinition>();
            var skillId = "test:tag_order_" + Guid.NewGuid().ToString("N");
            var serialized = new SerializedObject(definition);
            serialized.FindProperty("skillId").stringValue = skillId;
            var levels = serialized.FindProperty("levels");
            levels.arraySize = 2;
            var grantedTags = levels.GetArrayElementAtIndex(1).FindPropertyRelative("grantedTags");
            grantedTags.arraySize = 1;
            grantedTags.GetArrayElementAtIndex(0).stringValue = "State.Trained";
            serialized.ApplyModifiedPropertiesWithoutUndo();
            SkillDefinitions.Register(definition);

            var skills = new CharacterSkills();
            var tags = new TagSet();
            typeof(CharacterSkills).GetMethod("BindTags", BindingFlags.Instance | BindingFlags.NonPublic)
                ?.Invoke(skills, new object[] { tags });

            var observer = new SkillTagObserver(skills, tags);
            EventBus<SkillLevelChangedEvent>.Subscribe(observer);
            try
            {
                Assert.That(skills.TryLevelUp(skillId), Is.True);
                Assert.That(observer.SawUpgradeWithTag, Is.True);

                tags.SetSourceTags("boon:mercury", new[] { "State.Inspired" });
                typeof(CharacterSkills).GetMethod("UnbindTags", BindingFlags.Instance | BindingFlags.NonPublic)
                    ?.Invoke(skills, new object[] { tags });
                Assert.That(tags.Has("State.Trained"), Is.False);
                Assert.That(tags.Has("State.Inspired"), Is.True);
                typeof(CharacterSkills).GetMethod("BindTags", BindingFlags.Instance | BindingFlags.NonPublic)
                    ?.Invoke(skills, new object[] { tags });
                Assert.That(tags.Has("State.Trained"), Is.True);

                typeof(CharacterSkills).GetMethod("RestoreLevels", BindingFlags.Instance | BindingFlags.NonPublic)
                    ?.Invoke(skills, new object[] { Array.Empty<KeyValuePair<string, int>>() });
                Assert.That(observer.SawResetWithoutTag, Is.True);
            }
            finally
            {
                EventBus<SkillLevelChangedEvent>.Unsubscribe(observer);
                typeof(CharacterSkills).GetMethod("UnbindTags", BindingFlags.Instance | BindingFlags.NonPublic)
                    ?.Invoke(skills, new object[] { tags });
                UnityEngine.Object.DestroyImmediate(definition);
            }
        }

        private sealed class SkillTagObserver : IEventListener<SkillLevelChangedEvent>
        {
            private readonly CharacterSkills _skills;
            private readonly TagSet _tags;

            public bool SawUpgradeWithTag { get; private set; }
            public bool SawResetWithoutTag { get; private set; }

            public SkillTagObserver(CharacterSkills skills, TagSet tags)
            {
                _skills = skills;
                _tags = tags;
            }

            public void OnEvent(SkillLevelChangedEvent change)
            {
                if (!ReferenceEquals(change.Skills, _skills)) return;
                if (change.NewLevel == 1) SawUpgradeWithTag = _tags.Has("State.Trained");
                if (change.NewLevel == 0) SawResetWithoutTag = !_tags.Has("State.Trained");
            }
        }
    }
}

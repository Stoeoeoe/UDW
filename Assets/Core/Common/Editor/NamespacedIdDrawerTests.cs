using Character;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Core.Common.Editor
{
    public sealed class NamespacedIdDrawerTests
    {
        [TestCase("", "base", "")]
        [TestCase(null, "base", "")]
        [TestCase("hammer_mastery", "base", "hammer_mastery")]
        [TestCase("base:hammer_mastery", "base", "hammer_mastery")]
        [TestCase("mymod:chest", "mymod", "chest")]
        public void SplitDefaultsOnlyTheDisplayedNamespace(string value, string expectedNamespace, string expectedId)
        {
            NamespacedIdDrawer.Split(value, out var ns, out var id);
            Assert.That(ns, Is.EqualTo(expectedNamespace));
            Assert.That(id, Is.EqualTo(expectedId));
        }

        [Test]
        public void EditingOnePartPreservesTheOtherForEverySelectedObject()
        {
            var first = ScriptableObject.CreateInstance<SkillDefinition>();
            var second = ScriptableObject.CreateInstance<SkillDefinition>();
            try
            {
                SetId(first, "base:one");
                SetId(second, "mymod:two");
                var targets = new Object[] { first, second };
                NamespacedIdDrawer.AssignParts(targets, "_skillId", null, "three");
                Assert.That(first.SkillId, Is.EqualTo("base:three"));
                Assert.That(second.SkillId, Is.EqualTo("mymod:three"));
                SetId(second, "mymod:two");
                NamespacedIdDrawer.AssignParts(targets, "_skillId", "other", null);
                Assert.That(first.SkillId, Is.EqualTo("other:three"));
                Assert.That(second.SkillId, Is.EqualTo("other:two"));
            }
            finally
            {
                Object.DestroyImmediate(first);
                Object.DestroyImmediate(second);
            }
        }

        [Test]
        public void EmptyIdGetsBaseNamespaceOnFirstEditAndColonCannotBeEnteredInEitherPart()
        {
            var skill = ScriptableObject.CreateInstance<SkillDefinition>();
            try
            {
                NamespacedIdDrawer.AssignParts(new Object[] { skill }, "_skillId", null, "chest");
                Assert.That(skill.SkillId, Is.EqualTo("base:chest"));
                NamespacedIdDrawer.AssignParts(new Object[] { skill }, "_skillId", "my:mod", "cr:ate");
                Assert.That(skill.SkillId, Is.EqualTo("mymod:crate"));
            }
            finally { Object.DestroyImmediate(skill); }
        }

        private static void SetId(SkillDefinition skill, string id)
        {
            var serialized = new SerializedObject(skill);
            serialized.FindProperty("_skillId").stringValue = id;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }
    }
}

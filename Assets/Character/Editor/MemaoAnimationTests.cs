using System;
using System.Collections.Generic;
using System.Reflection;
using Character.Animations;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Character.Editor
{
    public sealed class MemaoAnimationTests
    {
        private const string LibraryPath = "Assets/Character/Memao/Generated/NewMainCharacter/NewMainCharacter_Animations.asset";
        private CharacterAnimation _animation;
        private MemaoAnimationLibrary _library;

        [SetUp]
        public void SetUp()
        {
            _library = AssetDatabase.LoadAssetAtPath<MemaoAnimationLibrary>(LibraryPath);
            Assert.That(_library, Is.Not.Null, "The imported character library is required by these fixtures.");
            _animation = ScriptableObject.CreateInstance<CharacterAnimation>();
            Set("animationId", "test:memao-action");
        }

        [TearDown]
        public void TearDown() => Object.DestroyImmediate(_animation);

        [TestCase(0, 0, "D")]
        [TestCase(0, 1, "U")]
        [TestCase(-1, 0, "L")]
        [TestCase(1, 0, "R")]
        [TestCase(-1, 1, "L")]
        public void DefinitionResolvesDirectionalImporterClips(float x, float y, string direction)
        {
            Set("memaoAction", "Sit");
            Assert.That(_animation.ValidateConfiguration(), Is.Empty);
            Assert.That(_library.TryGet("Sit_" + direction, out var expected), Is.True);
            Assert.That(_animation.ResolveClip(_library, new Vector2(x, y)), Is.SameAs(expected));
            Assert.DoesNotThrow(() => _animation.ValidateAsOneShot(_library));
        }

        [Test]
        public void ImportedCharacterUsesMapPixelScaleAndFeetOrigin()
        {
            var clip = _library.GetDirectional("Idle", Vector2.down);
            var binding = EditorCurveBinding.PPtrCurve("", typeof(SpriteRenderer), "m_Sprite");
            var sprite = (Sprite)AnimationUtility.GetObjectReferenceCurve(clip, binding)[0].value;
            Assert.That(sprite.pixelsPerUnit, Is.EqualTo(16));
            Assert.That(sprite.pivot, Is.EqualTo(new Vector2(24, 7)));
        }

        [TestCase("Mine_D", 80, 4)]
        [TestCase("Mine_U", 84, 4)]
        [TestCase("Mine_L", 88, 4)]
        [TestCase("Mine_R", 92, 4)]
        [TestCase("Seed_D", 112, 3)]
        [TestCase("Seed_U", 115, 3)]
        [TestCase("Seed_L", 118, 3)]
        [TestCase("Seed_R", 121, 3)]
        [TestCase("Reap_D", 140, 4)]
        [TestCase("Reap_U", 144, 4)]
        [TestCase("Reap_L", 148, 4)]
        [TestCase("Reap_R", 152, 4)]
        [TestCase("Water_D", 124, 4)]
        [TestCase("Water_U", 128, 4)]
        [TestCase("Water_L", 132, 4)]
        [TestCase("Water_R", 136, 4)]
        public void FarmingActionsUseTheirActualAtlasFrames(string name, int firstFrame, int count)
        {
            Assert.That(_library.TryGet(name, out var clip), Is.True);
            var binding = EditorCurveBinding.PPtrCurve("", typeof(SpriteRenderer), "m_Sprite");
            var keys = AnimationUtility.GetObjectReferenceCurve(clip, binding);
            Assert.That(keys.Length, Is.EqualTo(count));
            for (var i = 0; i < count; i++)
                Assert.That(keys[i].value.name, Is.EqualTo($"Frame_{firstFrame + i:D3}"));
        }

        [Test]
        public void DefinitionUsesThePerformingCharactersLibrary()
        {
            Set("memaoAction", "Sit");
            var other = ScriptableObject.CreateInstance<MemaoAnimationLibrary>();
            try
            {
                var alternate = _library.GetDirectional("Read", Vector2.left);
                other.SetClips(new List<MemaoAnimationLibrary.Entry> { new() { name = "Sit_L", clip = alternate } });
                Assert.That(_animation.ResolveClip(other, Vector2.left), Is.SameAs(alternate));
                Assert.That(_animation.ResolveClip(_library, Vector2.left), Is.Not.SameAs(alternate));
            }
            finally { Object.DestroyImmediate(other); }
        }

        [Test]
        public void FixedClipDefinitionsStillWorkWithoutALibrary()
        {
            var clip = _library.GetDirectional("Downed", Vector2.down);
            Set("clip", clip);
            Assert.That(_animation.ResolveClip(null, Vector2.left), Is.SameAs(clip));
            Assert.DoesNotThrow(() => _animation.ValidateAsOneShot());
            Set("memaoAction", "Downed");
            Assert.That(_animation.ValidateConfiguration(), Is.Not.Empty, "Two sources are ambiguous.");
        }

        [Test]
        public void MissingSetupAndLoopingOneShotsFailAtBinding()
        {
            Assert.That(_animation.ValidateConfiguration(), Is.Not.Empty);
            Set("memaoAction", "Idle");
            Assert.Throws<InvalidOperationException>(() => _animation.ValidateAsOneShot(_library));
            Assert.Throws<InvalidOperationException>(() => _animation.ResolveClip(null, Vector2.down));
            Set("memaoAction", "NotAnImportedAction");
            Assert.Throws<InvalidOperationException>(() => _animation.ResolveClip(_library, Vector2.down));
        }

        [Test]
        public void PartialPaintActionHasNoInventedUpOrDownClip()
        {
            Set("memaoAction", "Paint");
            Assert.DoesNotThrow(() => _animation.ValidateAsOneShot(_library));
            Assert.That(_animation.ResolveClip(_library, Vector2.left), Is.Not.Null);
            Assert.Throws<InvalidOperationException>(() => _animation.ResolveClip(_library, Vector2.up));
            Assert.That(_library.TryGet("Paint_U", out _), Is.False);
        }

        [Test]
        public void DuplicateAndMissingClipEntriesAreBrokenLibraries()
        {
            var invalid = ScriptableObject.CreateInstance<MemaoAnimationLibrary>();
            try
            {
                var entry = new MemaoAnimationLibrary.Entry { name = "Idle_D", clip = _library.GetDirectional("Idle", Vector2.down) };
                invalid.SetClips(new List<MemaoAnimationLibrary.Entry> { entry, entry });
                Assert.Throws<InvalidOperationException>(() => invalid.TryGet("Idle_D", out _));
                invalid.SetClips(new List<MemaoAnimationLibrary.Entry> { new() { name = "Idle_D" } });
                Assert.Throws<InvalidOperationException>(() => invalid.TryGet("Idle_D", out _));
            }
            finally { Object.DestroyImmediate(invalid); }
        }

        private void Set(string field, object value)
        {
            // Assemble the complete fixture before validating it, as the other animation tests do.
            var owner = field == "animationId" ? typeof(CharacterAnimationDefinition) : typeof(CharacterAnimation);
            owner.GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(_animation, value);
        }
    }
}

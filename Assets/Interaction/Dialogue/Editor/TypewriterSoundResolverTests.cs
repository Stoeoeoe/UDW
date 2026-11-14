using System;
using Character;
using Core.Tile.Editor.Vulcanus;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;
using TestConfiguration = Core.Common.Editor.ConfigurationTestData;

namespace Interaction.Dialog.Editor
{
    public sealed class TypewriterSoundResolverTests
    {
        private CharacterCatalog _characters;
        private TypewriterSoundCatalog _sounds;
        private TypewriterSound _fallback, _calm, _harsh;
        private TypewriterSoundResolver _resolver;

        [SetUp]
        public void SetUp()
        {
            _fallback = Sound("test:fallback");
            _calm = Sound("test:calm");
            _harsh = Sound("test:harsh");
            var fabia = VulcanusJson.Populate(ScriptableObject.CreateInstance<CharacterDefinition>(),
                "{ id: 'test:fabia', name: 'Fabia', typewriterSound: 'test:calm', emotionTypewriterSounds: { 'test:angry': 'test:harsh' } }");
            var mute = VulcanusJson.Populate(ScriptableObject.CreateInstance<CharacterDefinition>(), "{ id: 'test:mute', name: 'Mute' }");
            _characters = ScriptableObject.CreateInstance<CharacterCatalog>();
            _characters.Synchronize(new Object[] { fabia, mute });
            _sounds = ScriptableObject.CreateInstance<TypewriterSoundCatalog>();
            _sounds.Synchronize(new Object[] { _calm, _harsh });
            _resolver = new TypewriterSoundResolver(_characters, _sounds);
        }

        [TearDown]
        public void TearDown()
        {
            foreach (var each in new Object[] { _fallback, _calm, _harsh, _sounds, _characters }) Object.DestroyImmediate(each);
        }

        private static TypewriterSound Sound(string id)
        {
            var sound = ScriptableObject.CreateInstance<TypewriterSound>();
            TestConfiguration.Set(sound, "_soundId", id);
            return sound;
        }

        [Test]
        public void EmotionOverrideWinsOverTheCharactersDefault() =>
            Assert.That(_resolver.ResolveTypewriterSound("test:fabia", "test:angry", _fallback), Is.SameAs(_harsh));

        [TestCase("test:happy")]
        [TestCase(null)]
        public void EmotionWithoutAnOverrideUsesTheCharactersDefault(string emotion) =>
            Assert.That(_resolver.ResolveTypewriterSound("test:fabia", emotion, _fallback), Is.SameAs(_calm));

        [TestCase("test:mute")]
        [TestCase("test:not-a-character")]
        [TestCase(null)]
        [TestCase("")]
        public void NarratorsAndCharactersWithoutSoundsUseTheDialogueDefault(string speaker) =>
            Assert.That(_resolver.ResolveTypewriterSound(speaker, "test:angry", _fallback), Is.SameAs(_fallback));

        [Test]
        public void UnregisteredSoundNamedByACharacterFailsClearly()
        {
            _sounds.Synchronize(new Object[] { _calm });
            Assert.Throws<InvalidOperationException>(() => _resolver.ResolveTypewriterSound("test:fabia", "test:angry", _fallback));
        }
    }
}

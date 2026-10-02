using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using Character;
using Core.Events;
using Core.TimeAndWeather;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Divinity.Editor
{
    public sealed class DivineFavourTests
    {
        private readonly List<Object> _objects = new();
        private readonly List<DivineFavourManager> _managers = new();

        [TearDown]
        public void Cleanup()
        {
            foreach (var manager in _managers) manager.Dispose();
            _managers.Clear();
            foreach (var instance in _objects) Object.DestroyImmediate(instance);
            _objects.Clear();
            typeof(DeityDefinitions).GetMethod("Reset", BindingFlags.Static | BindingFlags.NonPublic)
                ?.Invoke(null, null);
        }

        [Test]
        public void ThresholdsAreCumulativeReversibleAndCurrentDuringNotifications()
        {
            var defense = CreateBoon(CharacterAttributeType.PhysicalDefense, 2);
            var boonData = new SerializedObject(defense);
            var tags = boonData.FindProperty("grantedTags");
            tags.arraySize = 1;
            tags.GetArrayElementAtIndex(0).stringValue = "State.Blessed";
            boonData.ApplyModifiedPropertiesWithoutUndo();
            var health = CreateBoon(CharacterAttributeType.MaxHealth, 10);
            var deity = CreateDeity("test:" + Guid.NewGuid().ToString("N"), "TestDeity", 0, defense);
            AddLevel(deity, 20, health);
            DeityDefinitions.Register(deity);
            var state = new DivineFavourState();
            var manager = CreateManager(state);
            var character = CreateCharacter();
            character.SetPhysicalDefenseModifier("equipment:shield", 3);
            manager.BindCharacter(character);
            var observedDefense = -1;
            var listener = new FavourObserver(change =>
            {
                if (ReferenceEquals(change.State, state)) observedDefense = character.PhysicalDefense;
            });
            EventBus<DivineFavourChangedEvent>.Subscribe(listener);
            try
            {
                manager.AddFavour(deity.Id, 9);
                Assert.That(character.PhysicalDefense, Is.EqualTo(3));
                manager.AddFavour(deity.Id, 1);
                Assert.That(observedDefense, Is.EqualTo(5));
                Assert.That(character.Tags.Has("State.Blessed"), Is.True);
                manager.AddFavour(deity.Id, 10);
                Assert.That(character.PhysicalDefense, Is.EqualTo(5));
                Assert.That(character.MaxHealth, Is.EqualTo(110));
                manager.AddFavour(deity.Id, -11);
                Assert.That(observedDefense, Is.EqualTo(3));
                Assert.That(character.Tags.Has("State.Blessed"), Is.False);
                Assert.That(character.MaxHealth, Is.EqualTo(100));
            }
            finally { EventBus<DivineFavourChangedEvent>.Unsubscribe(listener); }
        }

        [Test]
        public void RestoreAndCharacterReplacementRebuildWithoutStackingOrDecaying()
        {
            var deity = CreateDeity("test:" + Guid.NewGuid().ToString("N"), "TestDeity", 2,
                CreateBoon(CharacterAttributeType.WalkSpeed, 1));
            DeityDefinitions.Register(deity);
            var manager = CreateManager(new DivineFavourState());
            var first = CreateCharacter();
            var second = CreateCharacter();
            manager.Restore(new Dictionary<string, int> { [deity.Id] = 10 });
            manager.BindCharacter(first);
            Assert.That(manager.GetFavour(deity.Id), Is.EqualTo(10));
            Assert.That(first.WalkSpeed, Is.EqualTo(5));
            manager.BindCharacter(first);
            Assert.That(first.WalkSpeed, Is.EqualTo(5));
            manager.BindCharacter(second);
            Assert.That(first.WalkSpeed, Is.EqualTo(4));
            Assert.That(second.WalkSpeed, Is.EqualTo(5));
            NewDayEvent.Trigger(2);
            Assert.That(manager.GetFavour(deity.Id), Is.EqualTo(8));
            Assert.That(second.WalkSpeed, Is.EqualTo(4));
        }

        [Test]
        public void MultipleDeitiesKeepIndependentContributionsAndDecayStopsAtNeutral()
        {
            var boon = CreateBoon(CharacterAttributeType.PhysicalDefense, 2);
            var first = CreateDeity("test:" + Guid.NewGuid().ToString("N"), "First", 100, boon);
            var second = CreateDeity("test:" + Guid.NewGuid().ToString("N"), "Second", 0, boon);
            DeityDefinitions.Register(first);
            DeityDefinitions.Register(second);
            var manager = CreateManager(new DivineFavourState());
            var character = CreateCharacter();
            manager.BindCharacter(character);
            manager.AddFavour(first.Id, 10);
            manager.AddFavour(second.Id, 10);
            Assert.That(character.PhysicalDefense, Is.EqualTo(4));
            manager.AdvanceDays(1);
            Assert.That(manager.GetFavour(first.Id), Is.Zero);
            Assert.That(manager.GetFavour(second.Id), Is.EqualTo(10));
            Assert.That(character.PhysicalDefense, Is.EqualTo(2));
            manager.AddFavour(first.Id, -5);
            manager.AdvanceDays(1);
            Assert.That(manager.GetFavour(first.Id), Is.Zero);
        }

        [Test]
        public void MissingDefinitionKeepsRestoredFavourButCannotReceiveNewPoints()
        {
            var id = "test:missing_" + Guid.NewGuid().ToString("N");
            var manager = CreateManager(new DivineFavourState());
            manager.Restore(new Dictionary<string, int> { [id] = 7 });

            Assert.That(manager.GetFavour(id), Is.EqualTo(7));
            Assert.Throws<InvalidOperationException>(() => manager.AddFavour(id, 1));
        }

        [Test]
        public void GeneratedNamesAreStableAndDoNotDependOnDisplayNamesOrInputOrder()
        {
            var mars = CreateDeity("mars", "Mars", 0);
            var river = CreateDeity("mod:river_god", "", 0);
            var original = DeityCodeGenerator.GenerateSource(new[] { mars, river });
            var serialized = new SerializedObject(mars);
            serialized.FindProperty("displayName").stringValue = "A different label";
            serialized.ApplyModifiedPropertiesWithoutUndo();
            Assert.That(DeityCodeGenerator.GenerateSource(new[] { river, mars }), Is.EqualTo(original));
            Assert.That(original, Does.Contain("public const string Mars = \"mars\";"));
            Assert.That(original, Does.Contain("public const string RiverGod = \"mod:river_god\";"));
        }

        [Test]
        public void GeneratorRejectsCollidingOrInvalidCSharpNames()
        {
            var first = CreateDeity("mars", "Mars", 0);
            var collision = CreateDeity("mod:mars", "Mars", 0);
            Assert.Throws<ArgumentException>(() => DeityCodeGenerator.GenerateSource(new[] { first, collision }));
            var invalid = CreateDeity("another", "not valid", 0);
            Assert.Throws<ArgumentException>(() => DeityCodeGenerator.GenerateSource(new[] { invalid }));
            var reserved = CreateDeity("reserved", "class", 0);
            Assert.Throws<ArgumentException>(() => DeityCodeGenerator.GenerateSource(new[] { reserved }));
        }

        [Test]
        public void DuplicateIdsAreRejectedByTheRegistry()
        {
            var id = "test:" + Guid.NewGuid().ToString("N");
            var first = CreateDeity(id, "First", 0);
            var duplicate = CreateDeity(id, "Other", 0);
            DeityDefinitions.Register(first);
            Assert.Throws<InvalidOperationException>(() => DeityDefinitions.Register(duplicate));
        }

        [Test]
        public void GeneratorDoesNotInspectGameplayDataOrEnforceRegistryIdentity()
        {
            var first = CreateDeity("mars", "Mars", -1);
            var serialized = new SerializedObject(first);
            var levels = serialized.FindProperty("levels");
            levels.arraySize = 1;
            levels.GetArrayElementAtIndex(0).FindPropertyRelative("requiredPoints").intValue = -10;
            var boons = levels.GetArrayElementAtIndex(0).FindPropertyRelative("boons");
            boons.arraySize = 1;
            boons.GetArrayElementAtIndex(0).objectReferenceValue = null;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            var duplicate = CreateDeity("mars", "Other", 0);

            var source = DeityCodeGenerator.GenerateSource(new[] { first, duplicate });
            Assert.That(source, Does.Contain("public const string Mars = \"mars\";"));
            Assert.That(source, Does.Contain("public const string Other = \"mars\";"));
        }

        [Test]
        public void GeneratorDoesNotRewriteUnchangedOutputAndEscapesStringLiterals()
        {
            var deity = CreateDeity("mod:quoted\"id\\", "Quoted", 0);
            var source = DeityCodeGenerator.GenerateSource(new[] { deity });
            Assert.That(source, Does.Contain("mod:quoted\\\"id\\\\"));
            var directory = Path.Combine(Path.GetTempPath(), "deity-generator-" + Guid.NewGuid().ToString("N"));
            var path = Path.Combine(directory, "Deities.g.cs");
            try
            {
                Assert.That(DeityCodeGenerator.WriteIfChanged(path, source), Is.True);
                var modified = File.GetLastWriteTimeUtc(path);
                Assert.That(DeityCodeGenerator.WriteIfChanged(path, source), Is.False);
                Assert.That(File.GetLastWriteTimeUtc(path), Is.EqualTo(modified));
            }
            finally
            {
                File.Delete(path);
                Directory.Delete(directory);
            }
        }

        private DivineFavourManager CreateManager(DivineFavourState state)
        {
            var manager = new DivineFavourManager(state);
            _managers.Add(manager);
            return manager;
        }

        private GameCharacter CreateCharacter()
        {
            var gameObject = new GameObject("Favour test character");
            gameObject.SetActive(false);
            _objects.Add(gameObject);
            return gameObject.AddComponent<GameCharacter>();
        }

        private BoonDefinition CreateBoon(CharacterAttributeType attribute, float flat)
        {
            var boon = ScriptableObject.CreateInstance<BoonDefinition>();
            _objects.Add(boon);
            var serialized = new SerializedObject(boon);
            var bonuses = serialized.FindProperty("attributes");
            bonuses.arraySize = 1;
            bonuses.GetArrayElementAtIndex(0).FindPropertyRelative("attribute").intValue = (int)attribute;
            bonuses.GetArrayElementAtIndex(0).FindPropertyRelative("flat").floatValue = flat;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            return boon;
        }

        private DeityDefinition CreateDeity(string id, string codeName, int dailyDecay, BoonDefinition boon = null)
        {
            var deity = ScriptableObject.CreateInstance<DeityDefinition>();
            _objects.Add(deity);
            var serialized = new SerializedObject(deity);
            serialized.FindProperty("id").stringValue = id;
            serialized.FindProperty("codeName").stringValue = codeName;
            serialized.FindProperty("dailyDecay").intValue = dailyDecay;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            if (boon) AddLevel(deity, 10, boon);
            return deity;
        }

        private static void AddLevel(DeityDefinition deity, int points, BoonDefinition boon)
        {
            var serialized = new SerializedObject(deity);
            var levels = serialized.FindProperty("levels");
            var index = levels.arraySize;
            levels.arraySize++;
            var level = levels.GetArrayElementAtIndex(index);
            level.FindPropertyRelative("requiredPoints").intValue = points;
            var boons = level.FindPropertyRelative("boons");
            boons.arraySize = 1;
            boons.GetArrayElementAtIndex(0).objectReferenceValue = boon;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private sealed class FavourObserver : IEventListener<DivineFavourChangedEvent>
        {
            private readonly Action<DivineFavourChangedEvent> _callback;
            public FavourObserver(Action<DivineFavourChangedEvent> callback) => _callback = callback;
            public void OnEvent(DivineFavourChangedEvent change) => _callback(change);
        }
    }
}
